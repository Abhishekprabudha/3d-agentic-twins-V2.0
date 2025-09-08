// ---- Config (update BACKEND_URL after you deploy backend) ----
const BACKEND_URL = "https://<your-new-backend>.onrender.com";  // <-- replace with your deployed backend URL

// ---- Defaults (keep in sync with backend/settings.py) ----
const DEFAULTS = {
  VOICE_ON: true,
  AUTO_ZOOM_ON: true
};

// ---- Minimal UI helpers ----
const logEl = document.getElementById("events");
function logEvent(e) {
  const d = document.createElement("div");
  d.className = "row";
  d.textContent = JSON.stringify(e);
  logEl.prepend(d);
}

// ---- Map ----
const map = new maplibregl.Map({
  container: "map",
  style: "./style.json",
  center: [78.9629, 21.5937],
  zoom: 5.5,
  minZoom: 3,
  maxZoom: 12
});
map.addControl(
  new maplibregl.NavigationControl({ visualizePitch: false }),
  "top-left"
);

// simple red/green layers
function ensureLayers() {
  if (!map.getSource("alert"))
    map.addSource("alert", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    });
  if (!map.getLayer("alert-red"))
    map.addLayer({
      id: "alert-red",
      type: "line",
      source: "alert",
      paint: {
        "line-color": "#ff6b6b",
        "line-width": 4.5,
        "line-opacity": 0.98
      },
      layout: { "line-cap": "round", "line-join": "round" }
    });
  if (!map.getSource("fix"))
    map.addSource("fix", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    });
  if (!map.getLayer("fix-green"))
    map.addLayer({
      id: "fix-green",
      type: "line",
      source: "fix",
      paint: {
        "line-color": "#00d08a",
        "line-width": 5.2,
        "line-opacity": 0.98
      },
      layout: { "line-cap": "round", "line-join": "round" }
    });
}
function toLineString(coords) {
  return { type: "Feature", geometry: { type: "LineString", coordinates: coords } };
}

// demo city anchors & corridors
const CITY = {
  WH1: { lat: 28.6139, lon: 77.209 },
  WH2: { lat: 19.076, lon: 72.8777 },
  WH3: { lat: 12.9716, lon: 77.5946 },
  WH4: { lat: 17.385, lon: 78.4867 },
  WH5: { lat: 22.5726, lon: 88.3639 }
};
const RP = {
  "WH1-WH4": [[77.209, 28.6139], [78.4867, 17.385]],
  "WH1-WH2": [[77.209, 28.6139], [72.8777, 19.076]],
  "WH2-WH4": [[72.8777, 19.076], [78.4867, 17.385]],
  "WH3-WH2": [[77.5946, 12.9716], [72.8777, 19.076]],
  "WH5-WH2": [[88.3639, 22.5726], [72.8777, 19.076]]
};
const keyFor = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
function routeCoords(a, b) {
  const k = keyFor(a, b);
  return RP[k] || [
    [CITY[a].lon, CITY[a].lat],
    [CITY[b].lon, CITY[b].lat]
  ];
}

function setAlert(a, b) {
  const src = map.getSource("alert");
  if (!src) return;
  src.setData({
    type: "FeatureCollection",
    features: [toLineString(routeCoords(a, b))]
  });
}
function clearAlert() {
  const s = map.getSource("alert");
  if (s) s.setData({ type: "FeatureCollection", features: [] });
}
function setFixPairs(pairs) {
  const s = map.getSource("fix");
  if (!s) return;
  const feats = (pairs || []).map(([u, v]) => toLineString(routeCoords(u, v)));
  s.setData({ type: "FeatureCollection", features: feats });
}

// ---- WebSocket stream from backend ----
let voiceOn = DEFAULTS.VOICE_ON;
function tts(text) {
  if (!voiceOn) return;
  const synth = window.speechSynthesis;
  if (!synth) return;
  const u = new SpeechSynthesisUtterance(String(text));
  u.rate = 0.92;
  u.pitch = 1.0;
  synth.speak(u);
}

// ---- Dispatcher: contract-compliant ----
function handleEvent(evt) {
  logEvent(evt);

  switch (evt.type) {
    case "disruption": {
      const { a, b } = evt.payload || {};
      setAlert(a, b);
      tts(`Disruption on ${a} to ${b}`);
      break;
    }
    case "correct": {
      const { a, b } = evt.payload || {};
      clearAlert();
      setFixPairs([]);
      tts(`Correction applied on ${a} to ${b}`);
      break;
    }
    case "reroute": {
      const p = (evt.payload && evt.payload.path) || [];
      const pairs = [];
      for (let i = 0; i < p.length - 1; i++) pairs.push([p[i], p[i + 1]]);
      setFixPairs(pairs);
      tts(`Detour via ${p.join(" to ")}`);
      break;
    }
    case "inventory_delta": {
      const { wh, delta, reason } = evt.payload || {};
      logEvent({ type: "_info", msg: `Inventory ${wh} ${delta > 0 ? "+" : ""}${delta} (${reason || "delta"})` });
      break;
    }
    case "truck_add": {
      const { id, origin, destination } = evt.payload || {};
      logEvent({ type: "_info", msg: `New truck ${id} ${origin} -> ${destination}` });
      break;
    }
    case "query_result": {
      logEvent({ type: "_answer", answer: evt.payload });
      tts("Answer ready.");
      break;
    }
    case "clarify": {
      logEvent({ type: "_clarify", message: evt.payload?.message, options: evt.payload?.options });
      tts("Which option?");
      break;
    }
    case "focus": {
      logEvent({ type: "_focus", target: evt.payload?.target });
      break;
    }
    default:
      // tick, error, etc.
      break;
  }
}

function connectWS() {
  const ws = new WebSocket(BACKEND_URL.replace(/^http/, "ws") + "/events/ws");
  ws.onopen = () => logEvent({ type: "_ws", state: "open" });
  ws.onmessage = (ev) => {
    try {
      const evt = JSON.parse(ev.data);
      handleEvent(evt);
    } catch (e) {
      console.warn(e);
    }
  };
  ws.onclose = () => {
    logEvent({ type: "_ws", state: "closed" });
    setTimeout(connectWS, 1500);
  };
}
map.once("load", () => {
  ensureLayers();
  connectWS();
});

// ---- Buttons ----
document.getElementById("btnDemo").onclick = async () => {
  await fetch(BACKEND_URL + "/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Disrupt Delhi Hyderabad" })
  });
};
document.getElementById("btnVoice").onclick = () => {
  voiceOn = !voiceOn;
  document.getElementById("btnVoice").textContent = `Voice: ${voiceOn ? "On" : "Off"}`;
};
// Init button label from defaults
document.getElementById("btnVoice").textContent = `Voice: ${voiceOn ? "On" : "Off"}`;
