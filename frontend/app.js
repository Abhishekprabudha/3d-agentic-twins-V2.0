// ---- Config (update BACKEND_URL after you deploy backend) ----
const BACKEND_URL = "http://localhost:8000";

// ---- Minimal UI helpers ----
const logEl = document.getElementById("events");
function logEvent(e){ const d=document.createElement("div"); d.className="row"; d.textContent=JSON.stringify(e); logEl.prepend(d); }

// ---- Map ----
const map = new maplibregl.Map({
  container: "map",
  style: "./style.json", // fallback local style; you can use a CDN style if preferred
  center: [78.9629, 21.5937],
  zoom: 5.5,
  minZoom: 3, maxZoom: 12
});
map.addControl(new maplibregl.NavigationControl({visualizePitch:false}),"top-left");

// simple red/green layers to prove wiring
function ensureLayers(){
  if(!map.getSource("alert")) map.addSource("alert",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
  if(!map.getLayer("alert-red")) map.addLayer({id:"alert-red",type:"line",source:"alert",
    paint:{"line-color":"#ff6b6b","line-width":4.5,"line-opacity":0.98},"layout":{"line-cap":"round","line-join":"round"}});
  if(!map.getSource("fix")) map.addSource("fix",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
  if(!map.getLayer("fix-green")) map.addLayer({id:"fix-green",type:"line",source:"fix",
    paint:{"line-color":"#00d08a","line-width":5.2,"line-opacity":0.98},"layout":{"line-cap":"round","line-join":"round"}});
}
function toLineString(coords){ return {type:"Feature",geometry:{type:"LineString",coordinates:coords}}; }

// demo city anchors & a few corridors (keep tiny here; you’ll expand later)
const CITY={
  WH1:{lat:28.6139,lon:77.2090}, // Delhi
  WH2:{lat:19.0760,lon:72.8777}, // Mumbai
  WH4:{lat:17.3850,lon:78.4867}  // Hyderabad
};
const RP={
  "WH1-WH4":[[77.2090,28.6139],[78.4867,17.3850]],
  "WH1-WH2":[[77.2090,28.6139],[72.8777,19.0760]],
  "WH2-WH4":[[72.8777,19.0760],[78.4867,17.3850]]
};
const keyFor=(a,b)=>a<b?`${a}-${b}`:`${b}-${a}`;
function routeCoords(a,b){ const k=keyFor(a,b); return RP[k] || [[CITY[a].lon,CITY[a].lat],[CITY[b].lon,CITY[b].lat]]; }

function setAlert(a,b){
  const src=map.getSource("alert"); if(!src) return;
  src.setData({type:"FeatureCollection",features:[toLineString(routeCoords(a,b))]});
}
function clearAlert(){ const s=map.getSource("alert"); if(s) s.setData({type:"FeatureCollection",features:[]}); }
function setFixPairs(pairs){
  const s=map.getSource("fix"); if(!s) return;
  const feats=(pairs||[]).map(([u,v])=>toLineString(routeCoords(u,v)));
  s.setData({type:"FeatureCollection",features:feats});
}

// ---- WebSocket stream from backend ----
let voiceOn=false;
function tts(text){
  if(!voiceOn) return;
  const synth=window.speechSynthesis;
  if(!synth) return;
  const u=new SpeechSynthesisUtterance(String(text)); u.rate=0.92; u.pitch=1.0;
  synth.speak(u); // play once (keep simple here)
}

function handleEvent(evt){
  logEvent(evt);
  switch(evt.type){
    case "disruption": setAlert(evt.payload.a,evt.payload.b); tts(`Disruption on ${evt.payload.a} to ${evt.payload.b}`); break;
    case "correct": clearAlert(); setFixPairs([]); tts(`Correction applied on ${evt.payload.a} to ${evt.payload.b}`); break;
    case "reroute": {
      const p=evt.payload.path||[]; const pairs=[]; for(let i=0;i<p.length-1;i++) pairs.push([p[i],p[i+1]]);
      setFixPairs(pairs); tts(`Detour via ${p.join(" to ")}`); break;
    }
    default: /* no-op */ break;
  }
}

function connectWS(){
  const ws = new WebSocket(BACKEND_URL.replace(/^http/,"ws") + "/events/ws");
  ws.onopen = ()=>logEvent({type:"_ws","state":"open"});
  ws.onmessage = (ev)=>{ try{ const evt=JSON.parse(ev.data); handleEvent(evt); }catch(e){ console.warn(e); } };
  ws.onclose = ()=>{ logEvent({type:"_ws","state":"closed"}); setTimeout(connectWS, 1500); };
}
map.once("load",()=>{ ensureLayers(); connectWS(); });

// ---- Buttons ----
document.getElementById("btnDemo").onclick = async () => {
  await fetch(BACKEND_URL + "/command", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({text:"Disrupt Delhi Hyderabad"})
  });
};
document.getElementById("btnVoice").onclick = ()=>{
  voiceOn = !voiceOn;
  document.getElementById("btnVoice").textContent = `Voice: ${voiceOn?"On":"Off"}`;
};
