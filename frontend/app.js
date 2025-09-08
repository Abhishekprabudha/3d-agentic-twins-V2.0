// ---- Config ----
const BACKEND_URL = "https://<your-new-backend>.onrender.com"; // <- set to your deployed backend
const DEFAULTS = { VOICE_ON: true, AUTO_ZOOM_ON: true };

// ---- UI anchors ----
const chatEl = document.getElementById("chat");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send");
const demoBtn = document.getElementById("btnDemo");
const voiceBtn = document.getElementById("btnVoice");
const zoomBtn = document.getElementById("btnZoom");
const logEl = document.getElementById("eventslog");
const statsBody = document.querySelector("#statsTable tbody");

// ---- State ----
let voiceOn = DEFAULTS.VOICE_ON;
let autoZoomOn = DEFAULTS.AUTO_ZOOM_ON;
let lastSeq = 0;

// --- Baseline & Predictive stats (simple, local) ---
const BASE_INV = { WH1:520, WH2:480, WH3:430, WH4:410, WH5:460 };
const WNAMES   = { WH1:"Delhi", WH2:"Mumbai", WH3:"Bangalore", WH4:"Hyderabad", WH5:"Kolkata" };
let baseStats  = {};  // initial snapshot
let predStats  = {};  // live predicted values

function initStats(){
  baseStats = {};
  for(const id of Object.keys(BASE_INV)){
    baseStats[id] = { inv: BASE_INV[id], in: 0, out: 0 };
  }
  predStats = copyStats(baseStats);
  renderStats(predStats);
}
function copyStats(src){ const out={}; for(const k of Object.keys(src)) out[k]={...src[k]}; return out; }
function clampNonNeg(n){ return Math.max(0, Math.round(n)); }
function renderStats(s){
  if(!statsBody) return;
  statsBody.innerHTML = "";
  for(const id of Object.keys(WNAMES)){
    const r = s[id] || {inv:"-", in:0, out:0};
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${id} — ${WNAMES[id]}</td>
                    <td>${r.inv}</td>
                    <td class="pos">+${r.in}</td>
                    <td class="neg">-${r.out}</td>`;
    statsBody.appendChild(tr);
  }
}

// Simple predictive adjustments (local only):
function applyDisruption(a,b){
  const s = copyStats(predStats);
  if(!s[a]||!s[b]) return;
  s[a].out = clampNonNeg((s[a].out||0) - 1);
  s[b].in  = clampNonNeg((s[b].in||0)  - 1);
  s[a].inv = clampNonNeg((s[a].inv||0) + 1);
  s[b].inv = clampNonNeg((s[b].inv||0) - 1);
  predStats = s; renderStats(predStats);
}
function applyCorrect(a,b){
  // restore to baseline for those two nodes
  const s = copyStats(predStats);
  for(const id of [a,b]) if(baseStats[id]) s[id] = {...baseStats[id]};
  predStats = s; renderStats(predStats);
}
function applyReroute(path){
  const s = copyStats(predStats);
  if(!path || path.length < 2) return;
  const A = path[0], Z = path[path.length-1];
  if(s[A]) s[A].out = clampNonNeg((s[A].out||0)+1);
  if(s[Z]) s[Z].in  = clampNonNeg((s[Z].in||0)+1);
  for(let i=0;i<path.length-1;i++){
    const u=path[i], v=path[i+1];
    if(s[u] && u!==A) s[u].in  = clampNonNeg((s[u].in||0)+1);
    if(s[v] && v!==Z) s[v].out = clampNonNeg((s[v].out||0)+1);
  }
  predStats = s; renderStats(predStats);
}
function applyInvDelta(wh, delta){
  const s = copyStats(predStats);
  if(!s[wh]) return;
  s[wh].inv = clampNonNeg((s[wh].inv||0) + (delta||0));
  predStats = s; renderStats(predStats);
}

// ---- Helpers: chat/log/tts ----
function nowHHMM(){
  const d=new Date(); const p=n=>String(n).padStart(2,"0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
function addMsg(role, text, chips){
  const wrap=document.createElement("div");
  wrap.className=`msg ${role}`;
  wrap.innerHTML=`<div>${text}</div><span class="time">${nowHHMM()}</span>`;
  if (chips?.length){
    const row=document.createElement("div"); row.className="chips";
    chips.forEach(label=>{
      const b=document.createElement("button"); b.className="btn chip";
      b.textContent=label; b.onclick=()=>sendText(label);
      row.appendChild(b);
    });
    wrap.appendChild(row);
  }
  chatEl.appendChild(wrap);
  chatEl.scrollTop = chatEl.scrollHeight;
}
function logEvent(e){
  const d=document.createElement("div"); d.className="row";
  d.textContent=JSON.stringify(e);
  logEl.prepend(d);
}
function tts(text){
  if(!voiceOn) return;
  const s=window.speechSynthesis; if(!s) return;
  const u=new SpeechSynthesisUtterance(String(text)); u.rate=0.92; u.pitch=1.0;
  s.speak(u);
}

// ---- Map ----
const map = new maplibregl.Map({
  container: "map",
  style: "./style.json",
  center: [78.9629, 21.5937],
  zoom: 5.5, minZoom:3, maxZoom:12
});
map.addControl(new maplibregl.NavigationControl({visualizePitch:false}),"top-left");

function ensureLayers(){
  if(!map.getSource("routes")) map.addSource("routes",{type:"geojson",data:{type:"FeatureCollection",features:[]}});

  if(!map.getSource("alert")) map.addSource("alert",{type:"geojson",data:{type:"FeatureCollection",features:[]}})
  if(!map.getLayer("alert-red")) map.addLayer({id:"alert-red",type:"line",source:"alert",
    paint:{"line-color":"#ff6b6b","line-width":4.8,"line-opacity":0.98},layout:{"line-cap":"round","line-join":"round"}});

  if(!map.getSource("fix")) map.addSource("fix",{type:"geojson",data:{type:"FeatureCollection",features:[]}})
  if(!map.getLayer("fix-green")) map.addLayer({id:"fix-green",type:"line",source:"fix",
    paint:{"line-color":"#00d08a","line-width":5.4,"line-opacity":0.98},layout:{"line-cap":"round","line-join":"round"}});
}
function toLineString(coords){ return {type:"Feature",geometry:{type:"LineString",coordinates:coords}}; }

// Anchors & corridors (minimal; extend later)
const CITY={
  WH1:{lat:28.6139,lon:77.2090}, // Delhi
  WH2:{lat:19.0760,lon:72.8777}, // Mumbai
  WH3:{lat:12.9716,lon:77.5946}, // Bangalore
  WH4:{lat:17.3850,lon:78.4867}, // Hyderabad
  WH5:{lat:22.5726,lon:88.3639}  // Kolkata
};
const RP={
  "WH1-WH4":[[77.2090,28.6139],[78.4867,17.3850]],
  "WH1-WH2":[[77.2090,28.6139],[72.8777,19.0760]],
  "WH2-WH4":[[72.8777,19.0760],[78.4867,17.3850]],
  "WH3-WH2":[[77.5946,12.9716],[72.8777,19.0760]],
  "WH5-WH2":[[88.3639,22.5726],[72.8777,19.0760]],
};
const keyFor=(a,b)=>a<b?`${a}-${b}`:`${b}-${a}`;
function routeCoords(a,b){
  const k=keyFor(a,b);
  return RP[k]||[[CITY[a].lon,CITY[a].lat],[CITY[b].lon,CITY[b].lat]];
}
function featureForIds(a,b){ return toLineString(routeCoords(a,b)); }
function setAlert(a,b){
  const s=map.getSource("alert"); if(!s) return;
  s.setData({type:"FeatureCollection",features:[featureForIds(a,b)]});
}
function clearAlert(){
  const s=map.getSource("alert"); if(!s) return;
  s.setData({type:"FeatureCollection",features:[]});
}
function setFixPairs(pairs){
  const s=map.getSource("fix"); if(!s) return;
  const feats=(pairs||[]).map(([u,v])=>featureForIds(u,v));
  s.setData({type:"FeatureCollection",features:feats});
}
function fitToIds(list){
  if(!autoZoomOn||!list?.length) return;
  const pts = Array.isArray(list[0]) ? list.flat() : list;
  const b=new maplibregl.LngLatBounds();
  for(let i=0;i<pts.length;i++){
    const id=pts[i];
    if(CITY[id]) b.extend([CITY[id].lon,CITY[id].lat]);
  }
  if(!b.isEmpty()) map.fitBounds(b,{padding:{top:60,left:60,right:360,bottom:60},duration:650,maxZoom:6.9});
}

// ---- Simple moving truck for truck_add ----
const liveTrucks = [];
function spawnTruck(id, origin, destination){
  if(!CITY[origin] || !CITY[destination]) return;
  // build a simple 2-point path (origin -> destination)
  const path = routeCoords(origin, destination);
  const el = document.createElement("div");
  el.className = "truck";
  const marker = new maplibregl.Marker({element: el}).setLngLat(path[0]).addTo(map);
  const T = { id, marker, path, t: 0, speed: 0.0008 + Math.random()*0.0006 }; // tweak for motion
  liveTrucks.push(T);
}
function animateTrucks(){
  for(const T of liveTrucks){
    if(!T.path || T.path.length<2) continue;
    T.t += T.speed;
    if(T.t >= 1){ T.t = 0; } // loop for now
    const [x1,y1] = T.path[0], [x2,y2] = T.path[1];
    const lng = x1 + (x2 - x1)*T.t;
    const lat = y1 + (y2 - y1)*T.t;
    T.marker.setLngLat([lng, lat]);
  }
  requestAnimationFrame(animateTrucks);
}
requestAnimationFrame(animateTrucks);

// ---- WS Stream ----
function handleEvent(evt){
  if(evt.seq && evt.seq<=lastSeq) return;
  if(evt.seq) lastSeq = evt.seq;

  logEvent(evt);

  switch(evt.type){
    case "disruption":{
      const {a,b}=evt.payload||{};
      setAlert(a,b); setFixPairs([]);
      fitToIds([a,b]);
      applyDisruption(a,b);
      addMsg("assistant", `⚠️ Disruption on ${a}–${b}. Trucks paused.`, ["Fix", `Reroute ${a} -> WH2 -> ${b}`]);
      tts(`Disruption on ${a} to ${b}`);
      break;
    }
    case "correct":{
      const {a,b}=evt.payload||{};
      clearAlert(); setFixPairs([]);
      applyCorrect(a,b);
      addMsg("assistant", `✅ Correction applied on ${a}–${b}. Flows resuming.`);
      tts(`Correction applied on ${a} to ${b}`);
      break;
    }
    case "reroute":{
      const p = (evt.payload && evt.payload.path) || [];
      const pairs=[]; for(let i=0;i<p.length-1;i++) pairs.push([p[i],p[i+1]]);
      setFixPairs(pairs); fitToIds(p);
      applyReroute(p);
      addMsg("assistant", `🟢 Detour active: ${p.join(" → ")}`);
      tts(`Detour via ${p.join(" to ")}`);
      break;
    }
    case "inventory_delta":{
      const {wh,delta,reason}=evt.payload||{};
      applyInvDelta(wh, delta);
      addMsg("assistant", `Inv update: ${wh} ${delta>0?"+":""}${delta}${reason?` (${reason})`:""}`);
      break;
    }
    case "truck_add":{
      const {id,origin,destination}=evt.payload||{};
      spawnTruck(id, origin, destination);
      addMsg("assistant", `New truck ${id}: ${origin} → ${destination}`);
      break;
    }
    case "query_result":{
      const ans = evt.payload?.answer;
      addMsg("assistant", `Answer: ${typeof ans==="string"?ans:JSON.stringify(ans)}`);
      tts("Answer ready.");
      break;
    }
    case "clarify":{
      const msg = evt.payload?.message||"Which option?";
      const opts = evt.payload?.options||[];
      addMsg("assistant", msg, opts);
      tts("Which option?");
      break;
    }
    case "focus":{
      const target=evt.payload?.target;
      if(target && CITY[target]) fitToIds([target]);
      addMsg("assistant", `Focusing ${target||"target"}`);
      break;
    }
    default: /* tick, error, etc. */ break;
  }
}

function connectWS(){
  const ws = new WebSocket(BACKEND_URL.replace(/^http/, "ws") + "/events/ws");
  ws.onopen=()=>{ addMsg("assistant","(connected to event stream)"); initStats(); };
  ws.onmessage=(ev)=>{ try{ handleEvent(JSON.parse(ev.data)); }catch(e){ console.warn(e); } };
  ws.onclose =()=>{ addMsg("assistant","(stream disconnected — retrying)"); setTimeout(connectWS,1500); };
}
map.once("load", ()=>{ ensureLayers(); connectWS(); });

// ---- Chat / Commands ----
async function sendText(text){
  if(!text||!text.trim()) return;
  addMsg("user", text.trim());
  inputEl.value="";
  try{
    await fetch(BACKEND_URL + "/command", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ text })
    });
  }catch(e){
    addMsg("assistant","Backend unreachable. (Your message was not sent.)");
  }
}
sendBtn.onclick = ()=>sendText(inputEl.value);
inputEl.addEventListener("keydown",(e)=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); sendText(inputEl.value); } });

// ---- Top controls ----
demoBtn.onclick = ()=>sendText("Disrupt Delhi Hyderabad");
voiceBtn.onclick= ()=>{
  voiceOn = !voiceOn;
  voiceBtn.textContent = `Voice: ${voiceOn?"On":"Off"}`;
};
zoomBtn.onclick = ()=>{
  autoZoomOn = !autoZoomOn;
  zoomBtn.textContent = `Auto-Zoom: ${autoZoomOn?"On":"Off"}`;
};
// init labels
voiceBtn.textContent = `Voice: ${voiceOn?"On":"Off"}`;
zoomBtn.textContent = `Auto-Zoom: ${autoZoomOn?"On":"Off"}`;
