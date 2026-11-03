// HELLBALL server: serves the game files and relays online matches.
// 1v1 rooms: one Durable Object holding at most two WebSockets; it forwards every message to the other player.
// King of the Hill rooms (name starts with "k"): up to KOTH_MAX players; two play, the rest spectate in a queue.
// The server decides who is on, who is next and who holds the streak; the players still referee their own ends.
// Inside Discord the room name comes from the activity instance id, so everyone in the same activity shares a room.
const KOTH_MAX = 4, KOTH_WIN = 5;
export class Room {
  constructor(state) { this.state = state; this.k = null; }
  async fetch(req) {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("expected a websocket", { status: 426 });
    const room = req.headers.get("X-Room") || "";
    if (room[0] === "k") return this.kJoin();
    const [client, server] = Object.values(new WebSocketPair());
    const open = this.state.getWebSockets();
    if (open.length >= 2) {                                   // two already playing: say so and hang up
      server.accept(); server.send(JSON.stringify({ t: "full" })); server.close(1000, "full");
      return new Response(null, { status: 101, webSocket: client });
    }
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ host: open.length === 0 });  // the first one in serves first
    const all = this.state.getWebSockets();
    if (all.length === 2) for (const w of all) w.send(JSON.stringify({ t: "peer", host: !!(w.deserializeAttachment() || {}).host }));
    else server.send(JSON.stringify({ t: "wait" }));
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage(ws, msg) {
    if (typeof msg !== "string" || msg.length > 2048) return;
    for (const w of this.state.getWebSockets()) if (w !== ws) try { w.send(msg); } catch (e) {}
  }
  gone(ws) {
    for (const w of this.state.getWebSockets()) if (w !== ws) {   // whoever is left keeps the room and becomes the host
      w.serializeAttachment({ host: true });
      try { w.send(JSON.stringify({ t: "left" })); w.send(JSON.stringify({ t: "wait" })); } catch (e) {}
    }
  }
  webSocketClose(ws, code) { this.gone(ws); try { ws.close(code === 1005 ? 1000 : code, "bye"); } catch (e) {} }
  webSocketError(ws) { this.gone(ws); }

  /* ---------- King of the Hill: plain (non-hibernating) sockets, state kept in memory while anyone is connected ---------- */
  kJoin() {
    const k = this.k || (this.k = { socks: new Map(), line: [], champ: null, chal: null, streak: 0, ep: 0, serve: null, next: 1 });
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    if (k.socks.size >= KOTH_MAX) { server.send(JSON.stringify({ t: "full", max: KOTH_MAX })); server.close(1000, "full"); return new Response(null, { status: 101, webSocket: client }); }
    const id = k.next++;
    k.socks.set(id, server); k.line.push(id);
    server.addEventListener("message", e => this.kMsg(id, e.data));
    server.addEventListener("close", () => this.kLeave(id));
    server.addEventListener("error", () => this.kLeave(id));
    this.kFill(); this.kSend();
    return new Response(null, { status: 101, webSocket: client });
  }
  kFill() {                                                   // put people on court from the front of the line
    const k = this.k; let changed = false;
    if (k.champ == null && k.line.length) { k.champ = k.line.shift(); k.streak = 0; changed = true; }
    if (k.chal == null && k.champ != null && k.line.length) { k.chal = k.line.shift(); k.serve = k.chal; changed = true; }
    if (changed) k.ep++;
  }
  kState(you, extra) {
    const k = this.k;
    return JSON.stringify(Object.assign({ t: "ks", you, champ: k.champ, chal: k.chal, streak: k.streak, line: k.line, serve: k.serve, ep: k.ep, win: KOTH_WIN, max: KOTH_MAX }, extra || {}));
  }
  kSend(extra) { for (const [id, w] of this.k.socks) try { w.send(this.kState(id, extra)); } catch (e) {} }
  kMsg(id, data) {
    const k = this.k; if (!k || typeof data !== "string" || data.length > 2048) return;
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    if (m.t === "ping") { try { k.socks.get(id).send(JSON.stringify({ t: "pong", ts: m.ts })); } catch (e) {} return; }
    const active = id === k.champ || id === k.chal;
    if (m.t === "kmiss") {                                    // a player missed at their own end: the point is decided
      if (!active || m.ep !== k.ep || k.champ == null || k.chal == null) return;
      const loser = id, winner = id === k.champ ? k.chal : k.champ;
      if (winner === k.champ) k.streak++; else { k.champ = winner; k.streak = 1; }
      const won = k.streak >= KOTH_WIN ? winner : null;
      if (won) k.streak = 0;                                  // a new game starts straight away, the winner stays on
      if (k.line.length) { k.line.push(loser); k.chal = k.line.shift(); } else k.chal = loser;
      k.serve = k.chal; k.ep++;
      this.kSend({ pt: { winner, loser, won } });
      return;
    }
    if (!active || (m.t !== "p" && m.t !== "hit")) return;    // only the two on court talk; spectators just watch
    m.from = id; m.ep = k.ep; const s = JSON.stringify(m);
    for (const [oid, w] of k.socks) if (oid !== id) try { w.send(s); } catch (e) {}
  }
  kLeave(id) {
    const k = this.k; if (!k || !k.socks.has(id)) return;
    k.socks.delete(id); k.line = k.line.filter(x => x !== id);
    if (id === k.champ || id === k.chal) {                    // someone on court left: the other stays on, the next in line steps up
      const other = id === k.champ ? k.chal : k.champ;
      if (id === k.champ) { k.champ = other; k.streak = 0; }
      k.chal = null; k.serve = null;
      if (k.champ == null && k.line.length) k.champ = k.line.shift();
      this.kFill(); k.ep++;
    }
    if (!k.socks.size) { this.k = null; return; }
    this.kSend({ left: id });
  }
}
export default {
  async fetch(req, env) {
    const m = new URL(req.url).pathname.match(/^\/(?:\.proxy\/)?(?:ws\/)?((?:kdc|kweb|dc|web)-[A-Za-z0-9_-]{1,80})$/);   // /ws/<room>, or just /<room> if a Discord URL mapping stripped the /ws
    if (m) {
      const r = new Request(req); r.headers.set("X-Room", m[1]);
      return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(r);
    }
    return env.ASSETS.fetch(req);
  }
};
