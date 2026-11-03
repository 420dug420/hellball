/* HELLBALL - ONLINE MODES (1V1 ONLINE + KING OF THE HILL) + SERVER LEADERBOARD
   This file is separate from index.html on purpose: index.html can be replaced wholesale without losing the
   online modes. index.html only needs   <script src="online.js"></script>   just before </body>.
   It plugs into the game from outside: it adds its menu buttons, lobby and styles, and wraps hud(), step(),
   doServe(), goMenu() and endRun() (leaderboard). It relies on these game globals keeping their names: MODE st ball pad ai F BR PHe HZ
   strike reset show flash pulse tn tink burst rings trail balls syncField musicStart psyClick psyEvent
   bounceSnd bflash wa serveStep clickServe touchPaddle touchOn usingTouch held fmOn fmStep SERVE_TXT msg endRun hardOn dayKey.
   The relay server is worker.js (Cloudflare). */
/* ---------- SERVER LEADERBOARD: best scores per Discord server (or per DM, or one WORLD board on the web), kept by worker.js ---------- */
(()=>{
if(window.HBLB||!document.getElementById("modesel"))return;
const Q=new URLSearchParams(location.search),inDc=/[?&]frame_id=/.test(location.search);
const SCOPE=inDc?(Q.get("guild_id")?"g-"+Q.get("guild_id"):"c-"+(Q.get("channel_id")||"x")):"web";
const WHERE=inDc?(Q.get("guild_id")?"THIS SERVER":"THIS CHAT"):"WORLD";
const API=inDc?"/.proxy/ws/lb/"+SCOPE                                                   // Discord: through the /ws URL mapping
  :/\.workers\.dev$|^(localhost|127\.0\.0\.1)$/.test(location.hostname)?"/ws/lb/"+SCOPE
  :"https://hellball.hellball-discord.workers.dev/ws/lb/"+SCOPE;
const store=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){}return v};
let pid=store("hb_pid");if(!/^[a-z0-9]{8,24}$/.test(pid||""))pid=store("hb_pid",Array.from({length:12},()=>"abcdefghijklmnopqrstuvwxyz0123456789"[Math.random()*36|0]).join(""));
const myName=()=>store("hb_name")||"PLAYER-"+pid.slice(0,4).toUpperCase();
const BOARDS=[["normal","NORMAL"],["hard","HARD"],["gef","GEF"],["classic","CLASSIC"],["daily","DAILY"],["1v1","1V1 WINS"],["koth","KOTH CROWNS"]];
const today=()=>typeof dayKey==="function"?dayKey():new Date().toISOString().slice(0,10);
const key=b=>b==="daily"?"daily-"+today():b;
const post=o=>fetch(API,{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify(Object.assign({pid,n:myName()},o))}).then(r=>r.json());
const esc=t=>String(t).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

document.head.insertAdjacentHTML("beforeend",`<style>
#mL{border-color:#ff66cc;color:#ff66cc}#mL:hover{background:rgba(255,102,204,.08);text-shadow:0 0 8px #ff66cc}
#lbd{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(2,8,4,.95);z-index:70;padding:16px;box-sizing:border-box;overflow:auto;background:#020804}
#lbd.hidden{display:none}
#lbdTabs{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;max-width:640px}
#lbdTabs button{background:transparent;border:1px solid #119944;color:#119944;font-family:"Courier New",monospace;font-size:11px;letter-spacing:2px;padding:5px 10px;cursor:pointer}
#lbdTabs button.on{border-color:#ff66cc;color:#ff66cc;text-shadow:0 0 6px #ff66cc}
#lbdList{width:min(460px,92vw);font-size:14px;letter-spacing:2px;line-height:1.9;color:#33ff77;min-height:200px}
#lbdList .r{display:flex;gap:12px;border-bottom:1px solid rgba(17,153,68,.35)}#lbdList .r.me{color:#ffb000;text-shadow:0 0 8px rgba(255,176,0,.6)}
#lbdList .k{width:2.2em;text-align:right;color:#119944}#lbdList .me .k{color:#ffb000}#lbdList .n{flex:1;overflow:hidden;white-space:nowrap}#lbdList .s{text-align:right}#lbdList .l{width:4.2em;text-align:right;color:#119944;font-size:11px}
#lbdList .e{color:#119944;text-align:center;padding-top:70px}
#lbdYou{font-size:12px;letter-spacing:2px;color:#119944;min-height:1em}
#lbdName{display:flex;gap:8px;align-items:center;font-size:11px;letter-spacing:2px;color:#119944}
#lbdName input{width:12em;background:transparent;border:1px solid #119944;color:#33ff77;font-family:"Courier New",monospace;font-size:13px;letter-spacing:2px;padding:5px 8px;text-transform:uppercase;-webkit-user-select:text;user-select:text}
#lbdName button{background:transparent;border:1px solid #33ff77;color:#33ff77;font-family:"Courier New",monospace;font-size:11px;letter-spacing:2px;padding:5px 10px;cursor:pointer}
@media (max-height:520px){#lbd{justify-content:flex-start;gap:8px}#lbdList{font-size:12px;line-height:1.6;min-height:0}}
</style>`);
document.getElementById("prof").insertAdjacentHTML("beforebegin",'<button id="mL" class="mBtn">LEADERBOARD<small>best scores in '+WHERE.toLowerCase()+'</small></button>');
document.getElementById("modesel").insertAdjacentHTML("afterend",'<div id="lbd" class="hidden"><div class="msTitle">LEADERBOARD // '+WHERE+'</div><div id="lbdTabs">'+
  BOARDS.map(([b,t])=>'<button data-b="'+b+'">'+t+'</button>').join("")+'</div><div id="lbdList"></div><div id="lbdYou"></div>'+
  '<div id="lbdName">YOUR NAME <input id="lbdIn" maxlength="12" spellcheck="false"><button id="lbdSave">SAVE</button></div><button id="lbdX" class="mBtn">BACK TO MENU</button></div>');
const $=id=>document.getElementById(id);
let cur="normal",seq=0;
function render(d){
  const lv=cur!=="1v1"&&cur!=="koth";
  $("lbdList").innerHTML=!d?'<div class="e">COULD NOT REACH THE LEADERBOARD.</div>':!d.top.length?'<div class="e">NO SCORES YET.<br>BE THE FIRST.</div>':
    d.top.map((e,i)=>'<div class="r'+(e.me?" me":"")+'"><span class="k">'+(i+1)+'.</span><span class="n">'+esc(e.n)+'</span><span class="s">'+e.s+'</span><span class="l">'+(lv&&e.l?"LV "+e.l:"")+'</span></div>').join("");
  $("lbdYou").textContent=!d?"":d.you?(d.you.rank>10?"YOU: #"+d.you.rank+" OF "+d.total+"   "+d.you.s:""):"YOU ARE NOT ON THIS BOARD YET"}
function load(b){cur=b;for(const t of $("lbdTabs").children)t.classList.toggle("on",t.dataset.b===b);
  const n=++seq;$("lbdList").innerHTML='<div class="e">LOADING...</div>';$("lbdYou").textContent="";
  fetch(API+"?b="+encodeURIComponent(key(b))+"&pid="+pid).then(r=>r.json()).then(d=>{if(n===seq)render(d.top?d:null)},()=>{if(n===seq)render(null)})}
function openLb(){$("lbdIn").value=myName();$("lbd").classList.remove("hidden");load(cur)}
$("mL").addEventListener("click",()=>{if(typeof musicStart==="function")musicStart();openLb()});
$("lbdX").addEventListener("click",()=>$("lbd").classList.add("hidden"));
$("lbdTabs").addEventListener("click",e=>{const b=e.target.dataset&&e.target.dataset.b;if(b)load(b)});
for(const ev of ["keydown","keyup","keypress"])$("lbdIn").addEventListener(ev,e=>{e.stopPropagation();if(ev==="keydown"&&e.key==="Enter")$("lbdSave").click()});   // typing a name must not fire the game's hotkeys
$("lbdSave").addEventListener("click",()=>{const v=$("lbdIn").value.toUpperCase().replace(/[^A-Z0-9 _.-]/g,"").trim().slice(0,12);if(!v)return;
  store("hb_name",v);$("lbdIn").value=v;post({op:"name"}).then(()=>load(cur),()=>{});$("lbdSave").textContent="SAVED";setTimeout(()=>$("lbdSave").textContent="SAVE",1200)});

// every finished single-player run goes to its board; 1v1 wins and King of the Hill crowns are counted in the online code below
const boardNow=()=>MODE==="normal"?(typeof hardOn!=="undefined"&&hardOn?"hard":"normal"):MODE==="gef"||MODE==="classic"||MODE==="daily"?MODE:null;
const _endRun=endRun;endRun=function(lv){const b=boardNow(),sc=st.score,L=1+(+lv||0);const r=_endRun.apply(this,arguments);
  if(b&&sc>0)post({op:"score",b:key(b),s:sc,l:L}).then(d=>{if(d&&d.you&&d.you.rank<=10&&typeof flash==="function")flash(WHERE+" RANK #"+d.you.rank,"#ff66cc")},()=>{});
  return r};
window.HBLB={win:b=>post({op:"win",b}).catch(()=>{}),open:openLb,load,pid,api:API};
})();

(()=>{
if(document.getElementById("mO")||typeof window.netOpen==="function")return;   // index.html still has its own copy of the online code: let that one run

/* ---------- the menu buttons, lobby and styles ---------- */
document.head.insertAdjacentHTML("beforeend","<style>"+'#mK{border-color:#ffb000;color:#ffb000}\n#mK:hover{background:rgba(255,176,0,.08);text-shadow:0 0 8px #ffb000}\n#mO{border-color:#33d6ff;color:#33d6ff}\n#mO:hover{background:rgba(51,214,255,.08);text-shadow:0 0 8px #33d6ff}\n#lobby{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:rgba(2,8,4,.92);z-index:60;padding:16px;box-sizing:border-box;text-align:center}\n#lobby.hidden,#lobby .hidden{display:none}\n#lbCode{font-size:34px;letter-spacing:10px;color:#ffb000;text-shadow:0 0 12px rgba(255,176,0,.7)}\n#lbStatus{font-size:13px;letter-spacing:2px;line-height:1.9;color:#119944;max-width:560px}\n#lbLink{width:min(460px,90vw);background:transparent;border:1px solid #119944;color:#33ff77;font-family:"Courier New",monospace;font-size:12px;padding:8px 10px;text-align:center;-webkit-user-select:text;user-select:text}\n'+"</style>");
(document.getElementById("mL")||document.getElementById("prof")).insertAdjacentHTML("beforebegin",'<button id="mO" class="mBtn">1V1 ONLINE<small>play a friend &middot; first to 7</small></button><button id="mK" class="mBtn">KING OF THE HILL<small>up to 4 &middot; winner stays on &middot; 5 in a row wins</small></button>');
document.getElementById("modesel").insertAdjacentHTML("afterend",'<div id="lobby" class="hidden"><div class="msTitle">1V1 ONLINE</div><div id="lbCode"></div><div id="lbStatus"></div><input id="lbLink" class="hidden" readonly><button id="lbCopy" class="mBtn hidden">COPY INVITE LINK</button><button id="lbReady" class="mBtn hidden">READY</button><button id="lbBack" class="mBtn">BACK TO MENU</button></div>');
window.DISCORD_INSTANCE=window.DISCORD_INSTANCE||new URLSearchParams(location.search).get("instance_id");   // the same id the Discord SDK reads
/* ---------- ONLINE 1V1: two players through a tiny relay (worker.js); inside Discord the room is the activity instance ---------- */
// Both players run this same code in their OWN frame: you are always at z=0, the opponent always at z=1.
// Every ball sent over the wire is flipped into the receiver's frame (x -> -x, z -> 1-z). Each player is the
// referee for their own end, so a hit is judged on the screen of the person making it - no lag on your own paddle.
// Between hits the flight is deterministic (fixed 120 Hz steps), so only hits and misses need to be sent.
const RELAY="wss://hellball.hellball-discord.workers.dev",WIN_PTS=7,NSTEP=1/120,CODE_AB="ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const net={ws:null,host:false,live:false,full:false,leaving:false,code:"",room:"",me:0,them:0,server:"me",lastLoser:"them",
  meReady:false,themReady:false,meRe:false,themRe:false,ox:0,oy:0,ovx:0,ovy:0,acc:0,rtt:120,padT:0,lastMsg:0};
const $=id=>document.getElementById(id);
const inDiscord=()=>/[?&]frame_id=/.test(location.search);
const baseURL=()=>location.href.split(/[?#]/)[0];
const inviteURL=()=>baseURL()+(net.koth?"#koth=":"#join=")+net.code;
function newCode(){let s="";for(let i=0;i<5;i++)s+=CODE_AB[Math.floor(Math.random()*CODE_AB.length)];return s}
function netSend(m){if(net.ws&&net.ws.readyState===1)try{net.ws.send(JSON.stringify(m))}catch(e){}}
function lobby(o){                                               // o: {status, link, ready}
  $("modesel").classList.add("hidden");$("lobby").classList.remove("hidden");
  $("lbCode").textContent=inDiscord()?"":net.code;$("lbStatus").innerHTML=o.status;
  const link=!!o.link&&!inDiscord();["lbLink","lbCopy"].forEach(id=>$(id).classList.toggle("hidden",!link));if(link)$("lbLink").value=inviteURL();
  $("lbReady").classList.toggle("hidden",!o.ready)}
function waitMsg(){return inDiscord()?"WAITING FOR AN OPPONENT<br>ANYONE ELSE IN THIS ACTIVITY WHO PICKS 1V1 ONLINE LANDS RIGHT HERE."
  :"WAITING FOR AN OPPONENT<br>COPY THE INVITE LINK AND SEND IT. WHOEVER OPENS IT LANDS RIGHT HERE."}
function netOpen(code,koth){                                     // code given = joining from an invite link; koth = KING OF THE HILL room
  MODE="online";st.state="lobby";net.full=false;net.leaving=false;net.live=false;net.koth=!!koth;net.ks=null;net.spec=false;net.kPend=false;show("");
  if(inDiscord()){const id=window.DISCORD_INSTANCE;if(!id){lobby({status:"STILL CONNECTING TO DISCORD...<br>TRY AGAIN IN A SECOND."});return}
    net.code="";net.room=(koth?"kdc-":"dc-")+id}
  else{net.code=code||newCode();net.room=(koth?"kweb-":"web-")+net.code}
  lobby({status:"CONNECTING..."});
  const url=inDiscord()?(location.protocol==="https:"?"wss://":"ws://")+location.host+"/.proxy/ws/"+encodeURIComponent(net.room)   // Discord: through the activity's /ws URL mapping
    :/\.workers\.dev$|^(localhost|127\.0\.0\.1)$/.test(location.hostname)?(location.protocol==="https:"?"wss://":"ws://")+location.host+"/ws/"+encodeURIComponent(net.room)
    :RELAY+"/ws/"+encodeURIComponent(net.room);                // anywhere else (e.g. GitHub Pages): the relay on Cloudflare
  let ws;try{ws=net.ws=new WebSocket(url)}catch(e){lobby({status:"COULD NOT REACH THE GAME SERVER."});return}
  ws.onmessage=e=>{if(net.ws!==ws)return;let m;try{m=JSON.parse(e.data)}catch(_){return}
    net.lastMsg=performance.now();
    if(net.koth){kothMsg(m);return}
    if(m.t==="wait"){net.host=true;lobby({status:waitMsg(),link:true})}
    else if(m.t==="peer"){net.host=!!m.host;net.live=true;net.meReady=net.themReady=false;
      lobby({status:"OPPONENT CONNECTED<br>CLICK READY WHEN YOU ARE.",ready:true})}
    else if(m.t==="left"){if(net.live)netLost()}
    else if(m.t==="full"){net.full=true;lobby({status:inDiscord()?"TWO PEOPLE IN THIS ACTIVITY ARE ALREADY PLAYING 1V1.<br>WAIT FOR THEIR MATCH TO END, THEN TRY AGAIN.":"THAT LOBBY ALREADY HAS TWO PLAYERS."})}
    else netMsg(m)};
  ws.onclose=()=>{if(net.ws!==ws)return;net.ws=null;const was=net.live;net.live=false;
    if(net.leaving||net.full||MODE!=="online")return;reset();balls=[];st.state="lobby";show("");
    lobby({status:(was?"CONNECTION LOST.":"COULD NOT REACH THE GAME SERVER.")+"<br>GO BACK TO THE MENU AND PICK THE MODE AGAIN TO RETRY."})}}
function netLeave(){net.leaving=true;netSend({t:"bye"});try{net.ws&&net.ws.close()}catch(e){}net.ws=null;net.live=false;$("lobby").classList.add("hidden")}
function netLost(){
  if(net.koth){net.live=false;reset();st.state="lobby";show("");try{net.ws&&net.ws.close()}catch(e){}lobby({status:"CONNECTION LOST.<br>GO BACK TO THE MENU AND PICK THE MODE AGAIN TO RETRY."});return}
  net.live=false;reset();balls=[];st.state="lobby";show("");hud();
  lobby({status:"YOUR OPPONENT LEFT.<br>"+waitMsg().split("<br>")[1],link:true})}
setInterval(()=>{if(!net.live)return;const n=performance.now();netSend({t:"ping",ts:n});   // a timer, not a frame: keeps going in a background tab
  if(n-net.lastMsg>10000)netLost()},1000);
addEventListener("pagehide",()=>{if(net.ws)netSend({t:"bye"})});   // closing the tab tells the other side right away
$("lbReady").addEventListener("click",()=>{musicStart();net.meReady=true;netSend({t:"ready"});
  lobby({status:"WAITING FOR YOUR OPPONENT TO READY UP..."});netMaybeStart()});
$("lbCopy").addEventListener("click",()=>{const u=inviteURL(),b=$("lbCopy"),done=()=>{b.textContent="COPIED - PASTE IT ANYWHERE";setTimeout(()=>b.textContent="COPY INVITE LINK",1800)},
    old=()=>{$("lbLink").select();try{document.execCommand("copy")}catch(e){}done()};
  if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(u).then(done,old);else old()});
$("lbLink").addEventListener("focus",e=>e.target.select());
$("lbBack").addEventListener("click",()=>{if(location.hash)history.replaceState(null,"",baseURL()+location.search);goMenu()});
$("mO").addEventListener("click",()=>{musicStart();netOpen()});
function netMaybeStart(){if(net.meReady&&net.themReady){net.meReady=net.themReady=false;netStart(net.host?"me":"them")}}
function netStart(server){                                       // fresh match: 3-2-1, then the first serve
  $("lobby").classList.add("hidden");net.me=net.them=0;net.meRe=net.themRe=false;st.level=0;st.score=0;balls=[];reset();syncField();
  st.state="count";hud();let n=3;
  const cd=()=>{if(st.state!=="count")return;
    if(n>0){show(String(n),"FIRST TO "+WIN_PTS+" - MOVE YOUR MOUSE TO AIM");tn(440,.1,"square",.05);n--;setTimeout(cd,700)}
    else{tn(880,.2,"square",.05);netServe(server)}};cd()}
function netServe(server){                                       // the player who just lost the point serves
  net.server=server;reset();if(server==="them")ball.z=0.97;
  st.state="serve";st.armAt=performance.now()+700;st.first=true;hud();
  show(server==="me"?"YOUR SERVE":"OPPONENT SERVES",server==="me"?SERVE_TXT():"GET READY",true)}
function netHit(serve){const b=ball;
  netSend({t:"hit",serve,b:{x:b.x,y:b.y,z:b.z,vx:b.vx,vy:b.vy,vz:b.vz,sx:b.sx,sy:b.sy,hits:b.hits,hot:!!b.hot}})}
function netBall(h,quiet){                                       // one fixed physics step; true = stop stepping this frame
  if(ball.hold)return true;
  ball.vx+=ball.sx*h;ball.vy+=ball.sy*h;ball.x+=ball.vx*h;ball.y+=ball.vy*h;ball.z+=ball.vz*h;
  let bn=false;
  if(ball.x>F){ball.x=F;ball.vx=-ball.vx;bn=true}if(ball.x<-F){ball.x=-F;ball.vx=-ball.vx;bn=true}
  if(ball.y>F){ball.y=F;ball.vy=-ball.vy;bn=true}if(ball.y<-F){ball.y=-F;ball.vy=-ball.vy;bn=true}
  if(bn&&!quiet){bounceSnd();if(wa<.3)bflash.push({z:ball.z,t:0})}
  if(ball.z>=1&&ball.vz>0){ball.z=1;ball.hold=true;return true}  // their end: their screen decides, this one waits for the verdict
  if(ball.z<=0&&ball.vz<0){                                      // your end: your screen decides
    if(quiet)return true;
    const hh=PHe()+BR;
    if(Math.abs(ball.x-pad.x)<hh&&Math.abs(ball.y-pad.y)<hh){const hot=Math.abs(ball.x-pad.x)<HZ()&&Math.abs(ball.y-pad.y)<HZ();
      strike("p",ball.x-pad.x,ball.y-pad.y,pad.vx,pad.vy,false);ball.hot=hot;netHit(false)}
    else{ball.z=0;ball.hold=true;if(net.koth)netSend({t:"kmiss",ep:net.ep});else{netSend({t:"miss"});netPoint("them")}}
    return true}
  return false}
function netStep(dt){
  ai.x+=(net.ox-ai.x)*Math.min(1,dt*20);ai.y+=(net.oy-ai.y)*Math.min(1,dt*20);ai.vx=net.ovx;ai.vy=net.ovy;
  if(net.spec)return kothSpecStep(dt);
  const n=performance.now();if(net.live&&n-net.padT>33){net.padT=n;netSend({t:"p",x:pad.x,y:pad.y,vx:pad.vx,vy:pad.vy})}
  if(st.state==="serve"){if(net.server==="me")serveStep();return}
  if(st.state!=="play")return;
  net.acc+=dt;while(net.acc>=NSTEP){net.acc-=NSTEP;if(netBall(NSTEP,false)){net.acc=0;break}}
  trail.push([ball.x,ball.y,ball.z]);if(trail.length>14)trail.shift()}
function netMsg(m){
  if(!m||!m.t)return;
  if(m.t==="ping")netSend({t:"pong",ts:m.ts});
  else if(m.t==="pong"){net.rtt=net.rtt*.7+(performance.now()-m.ts)*.3;hud()}
  else if(m.t==="p"){net.ox=-m.x;net.oy=m.y;net.ovx=-m.vx;net.ovy=m.vy}
  else if(m.t==="ready"){net.themReady=true;if(!net.meReady)lobby({status:"YOUR OPPONENT IS READY.<br>CLICK READY TO START.",ready:true});netMaybeStart()}
  else if(m.t==="hit"){
    if(st.state!=="play"&&st.state!=="serve"&&st.state!=="between")return;
    const b=m.b;Object.assign(ball,{x:-b.x,y:b.y,z:1-b.z,vx:-b.vx,vy:b.vy,vz:-b.vz,sx:-b.sx,sy:b.sy,hits:b.hits,hot:b.hot,hold:false,touch:null,cork:null});
    if(st.state!=="play"){st.state="play";show("")}
    rings.push({x:ball.x,y:ball.y,z:ball.z,t:0,hot:b.hot});tink(b.hot);if(b.hot)flash("OPPONENT SWEET SPOT  +CURVE +SPEED","#ff4455");
    net.acc=0;const ff=Math.min(.15,net.rtt/2000);              // catch up by the one-way trip, so both screens see the ball in the same place
    for(let t=0;t<ff;t+=NSTEP)if(netBall(NSTEP,true))break}
  else if(m.t==="miss"){if(st.state==="play"){burst(ball.x,ball.y,1);netPoint("me")}}
  else if(m.t==="rematch"){net.themRe=true;if(st.state==="over"&&!net.meRe)show(msg.firstChild.textContent,"YOUR OPPONENT WANTS A REMATCH - CLICK TO ACCEPT");netMaybeRematch()}
  else if(m.t==="bye"){if(net.live)netLost()}}
function netPoint(who){
  if(who==="me")net.me++;else net.them++;
  st.level=Math.min(8,net.me+net.them);                          // the field heats up as the match goes on (capped below the level-10 wall blast)
  if(who==="me"){pulse("rgba(51,255,119,.35)");tn(660,.15,"square",.04);setTimeout(()=>tn(990,.25,"square",.04),120);flash("POINT   "+net.me+" - "+net.them,"#33ff77")}
  else{pulse("rgba(255,68,85,.45)");tn(130,.4,"sawtooth",.07,60);flash("OPPONENT SCORES   "+net.me+" - "+net.them,"#ff4455");psyEvent("miss")}
  hud();
  if(net.me>=WIN_PTS||net.them>=WIN_PTS){
    const won=net.me>net.them;net.lastLoser=won?"them":"me";net.meRe=net.themRe=false;st.state="over";
    if(won&&window.HBLB)HBLB.win("1v1");
    show(won?"YOU WIN":"YOU LOSE",net.me+" - "+net.them+"   CLICK FOR A REMATCH");
    if(won)[784,988,1175,1568].forEach((f,i)=>setTimeout(()=>tn(f,.18,"square",.045),i*90));return}
  st.state="between";setTimeout(()=>{if(st.state==="between")netServe(who==="me"?"them":"me")},900)}
function netClick(){if(st.state==="over"&&!net.meRe){net.meRe=true;netSend({t:"rematch"});
  show(msg.firstChild.textContent,"WAITING FOR YOUR OPPONENT...");netMaybeRematch()}}
function netMaybeRematch(){if(net.meRe&&net.themRe)netStart(net.lastLoser)}
function netHud(){if(net.koth)return kothHud();$("s").textContent="1V1 ONLINE   YOU "+net.me+" - "+net.them+" OPP   FIRST TO "+WIN_PTS+(net.live?"   PING "+Math.round(net.rtt)+"MS":"")}
/* ---------- KING OF THE HILL: up to 4 in a room, two on court, the rest watch in line; every point the loser goes to the back ---------- */
const KOTH_WIN=5;
const kname=id=>net.ks&&id===net.ks.you?"YOU":"P"+id;
function kothMsg(m){
  if(m.t==="ks"){kothState(m);return}
  if(m.t==="full"){net.full=true;lobby({status:"THIS KING OF THE HILL IS FULL ("+m.max+" PLAYERS).<br>TRY AGAIN WHEN SOMEONE LEAVES."});return}
  if(m.t==="pong"){net.rtt=net.rtt*.7+(performance.now()-m.ts)*.3;hud();return}
  if(m.ep!==undefined&&m.ep!==net.ep)return;                   // left over from an earlier point
  if(net.spec)kothSpecMsg(m);
  else if(m.from===net.opp)netMsg(m)}
function kothState(s){
  net.ks=s;net.ep=s.ep;net.live=true;
  if(s.pt){kothPoint(s);return}
  if(net.kPend){hud();return}                                    // a point is on screen: the timer applies the newest state
  kothApply(s)}
function kothPoint(s){                                           // a point was decided: show it, then swap
  const p=s.pt,me=s.you;
  st.state="between";ball.hold=true;net.kPend=true;
  if(p.loser===me){pulse("rgba(255,68,85,.45)");tn(130,.4,"sawtooth",.07,60);psyEvent("miss")}
  else if(p.winner===me){pulse("rgba(51,255,119,.35)");tn(660,.15,"square",.04);setTimeout(()=>tn(990,.25,"square",.04),120)}
  if(p.loser===net.far)burst(ball.x,ball.y,1);
  if(p.won){show(p.won===me?"YOU ARE KING OF THE HILL":kname(p.won)+" IS KING OF THE HILL",KOTH_WIN+" IN A ROW - NEW GAME STARTING");
    if(p.won===me&&window.HBLB)HBLB.win("koth");
    if(p.won===me)[784,988,1175,1568].forEach((f,i)=>setTimeout(()=>tn(f,.18,"square",.045),i*90))}
  else flash(p.winner===me?"POINT   STREAK "+s.streak+"/"+KOTH_WIN:p.loser===me?"YOU LOST THE POINT"+(s.line.includes(me)?"   BACK OF THE LINE":""):kname(p.winner)+" TAKES THE POINT",
    p.winner===me?"#33ff77":p.loser===me?"#ff4455":"#ffb000");
  hud();const ep=s.ep;
  setTimeout(()=>{if(net.kPend&&net.ks&&net.ks.ep>=ep&&MODE==="online"&&net.koth)kothApply(net.ks)},p.won?3000:900)}
function kothApply(s){
  net.kPend=false;const me=s.you,n=(s.champ!=null?1:0)+(s.chal!=null?1:0)+s.line.length;
  if(s.champ==null||s.chal==null){reset();balls=[];st.state="lobby";net.spec=false;show("");hud();
    lobby({status:"KING OF THE HILL<br>WAITING FOR MORE PLAYERS ("+n+"/"+s.max+")<br>"+(inDiscord()?"ANYONE ELSE IN THIS ACTIVITY CAN PICK KING OF THE HILL TO JOIN.":"SEND THE INVITE LINK - UP TO "+s.max+" CAN PLAY."),link:true});return}
  $("lobby").classList.add("hidden");$("modesel").classList.add("hidden");
  net.spec=me!==s.champ&&me!==s.chal;
  net.near=net.spec?s.champ:me;net.far=net.spec?s.chal:(me===s.champ?s.chal:s.champ);net.opp=net.spec?null:net.far;
  st.level=Math.min(8,s.streak);balls=[];reset();
  net.server=s.serve===net.near?"me":"them";if(net.server==="them")ball.z=0.97;
  net.acc=0;st.state="serve";st.armAt=performance.now()+600;st.first=true;hud();
  if(net.spec){const pos=s.line.indexOf(me);
    show("SPECTATING   "+kname(s.champ)+" VS "+kname(s.chal),pos===0?"YOU'RE NEXT UP":"YOU ARE #"+(pos+1)+" IN LINE",true)}
  else show(net.server==="me"?"YOUR SERVE":"OPPONENT SERVES",(me===s.champ?"YOU HOLD THE HILL   STREAK "+s.streak+"/"+KOTH_WIN:"KNOCK "+kname(s.champ)+" OFF THE HILL")+(s.line.length?"   //   NEXT UP: "+kname(s.line[0]):""),true)}
function kothSpecMsg(m){                                         // spectators see the match from the king's end
  const near=m.from===net.near;
  if(m.t==="p"){if(near){net.sx=m.x;net.sy=m.y}else{net.ox=-m.x;net.oy=m.y;net.ovx=-m.vx;net.ovy=m.vy}}
  else if(m.t==="hit"){const b=m.b;
    Object.assign(ball,near?{x:b.x,y:b.y,z:b.z,vx:b.vx,vy:b.vy,vz:b.vz,sx:b.sx,sy:b.sy}:{x:-b.x,y:b.y,z:1-b.z,vx:-b.vx,vy:b.vy,vz:-b.vz,sx:-b.sx,sy:b.sy},
      {hits:b.hits,hot:b.hot,hold:false,touch:null,cork:null});
    if(st.state!=="play")st.state="play";
    rings.push({x:ball.x,y:ball.y,z:ball.z,t:0,hot:b.hot});tink(b.hot);net.acc=0}}
function kothSpecStep(dt){
  net.kx=(net.kx||0)+((net.sx||0)-(net.kx||0))*Math.min(1,dt*20);net.ky=(net.ky||0)+((net.sy||0)-(net.ky||0))*Math.min(1,dt*20);
  pad.x=net.kx;pad.y=net.ky;pad.vx=pad.vy=0;
  if(st.state!=="play")return;
  net.acc+=dt;
  while(net.acc>=NSTEP){net.acc-=NSTEP;if(ball.hold){net.acc=0;break}
    ball.vx+=ball.sx*NSTEP;ball.vy+=ball.sy*NSTEP;ball.x+=ball.vx*NSTEP;ball.y+=ball.vy*NSTEP;ball.z+=ball.vz*NSTEP;
    let bn=false;
    if(ball.x>F){ball.x=F;ball.vx=-ball.vx;bn=true}if(ball.x<-F){ball.x=-F;ball.vx=-ball.vx;bn=true}
    if(ball.y>F){ball.y=F;ball.vy=-ball.vy;bn=true}if(ball.y<-F){ball.y=-F;ball.vy=-ball.vy;bn=true}
    if(bn){bounceSnd();if(wa<.3)bflash.push({z:ball.z,t:0})}
    if(ball.z>=1&&ball.vz>0){ball.z=1;ball.hold=true}else if(ball.z<=0&&ball.vz<0){ball.z=0;ball.hold=true}}
  trail.push([ball.x,ball.y,ball.z]);if(trail.length>14)trail.shift()}
function kothHud(){const s=net.ks;if(!s){$("s").textContent="KING OF THE HILL";return}
  $("s").textContent="KOTH  "+(s.champ!=null?"KING "+kname(s.champ)+" "+"★".repeat(s.streak)+"☆".repeat(Math.max(0,KOTH_WIN-s.streak)):"")+
    (s.chal!=null?"  VS "+kname(s.chal):"")+"  NEXT: "+(s.line.length?kname(s.line[0]):"-")+(net.live?"  "+Math.round(net.rtt)+"MS":"")}
$("mK").addEventListener("click",()=>{musicStart();netOpen(null,true)});

/* ---------- hooks into the game ---------- */
const _hud=hud;hud=function(){if(MODE==="online")return netHud();return _hud.apply(this,arguments)};
const _goMenu=goMenu;goMenu=function(){if(st.state!=="select"&&MODE==="online")netLeave();return _goMenu.apply(this,arguments)};
const _doServe=doServe;doServe=function(){const t=ball.touch,was=st.state;const r=_doServe.apply(this,arguments);
  if(MODE==="online"&&was==="serve"&&st.state==="play"&&t){ball.hot=Math.abs(t.dx)<HZ()&&Math.abs(t.dy)<HZ();netHit(true)}return r};
// step() runs the shared paddle/effects code first, then hands off to fmStep() when fmOn is set; online borrows that hand-off
const _fmStep=fmStep;fmStep=function(dt){if(MODE==="online")return netStep(dt);return _fmStep.apply(this,arguments)};
const _step=step;step=function(dt){if(MODE!=="online")return _step.apply(this,arguments);
  const f=fmOn;fmOn=true;try{return _step.apply(this,arguments)}finally{fmOn=f}};
cv.addEventListener("pointerdown",e=>{                           // online clicks: serve, rematch - never the single-player click handling
  if(MODE!=="online"||st.state==="select")return;
  e.stopImmediatePropagation();
  usingTouch=e.pointerType==="touch";const wasServe=st.state==="serve";
  if(usingTouch){touchPaddle(e,cv.getBoundingClientRect());if(typeof touchOn==="function")touchOn()}
  if(e.button===0&&!usingTouch)held=true;
  musicStart();psyClick();
  if(wasServe&&!usingTouch&&e.button===0&&net.server==="me")clickServe();else netClick()},{capture:true});

{const j=location.hash.match(/(join|koth)=([A-Z0-9]{5})(?![A-Z0-9])/i);if(j&&!inDiscord())netOpen(j[2].toUpperCase(),j[1].toLowerCase()==="koth")}   // opened from an invite link: straight to the lobby
window.HBNET={net,netOpen,kothPoint:()=>kothPoint};          // for testing
})();
