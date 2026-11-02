// HELLBALL server: serves the game files and relays 1v1 matches.
// Each room is one Durable Object holding at most two WebSockets; it forwards every message to the other player.
// Inside Discord the room name is the activity instance id, so everyone in the same activity shares a room.
export class Room {
  constructor(state) { this.state = state; }
  async fetch(req) {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("expected a websocket", { status: 426 });
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
}
export default {
  async fetch(req, env) {
    const m = new URL(req.url).pathname.match(/^\/(?:\.proxy\/)?ws\/([A-Za-z0-9_-]{1,80})$/);
    if (m) return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(req);
    return env.ASSETS.fetch(req);
  }
};
