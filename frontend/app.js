// === CONFIG ===
// Prefer using Netlify redirect (below) so frontend calls relative /api/* without CORS.
// If you don't use redirects, set API_BASE to your Render URL (no trailing slash).
const API_BASE = ''; // '' means use relative /api/* (recommended with Netlify redirects)
const STYLE_URL = './style.json'; // MapTiler style in repo root (Netlify-served)

import 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';

// ---- Debug overlay
const Debug = (() => {
  const box = document.getElementById('debug');
  return {
    log: (msg, err) => {
      box.style.display = 'block';
      box.textContent = `[${new Date().toLocaleTimeString()}] ${msg}` + (err ? `\n${(err.stack || err)}` : '');
      console.error(msg, err || '');
    }
  };
})();

// ---- Safe boot
document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();

async function boot() {
  try {
    const mapEl = document.getElementById('mapCanvas');
    if (!mapEl) throw new Error('#mapCanvas not found');

    const map = new maplibregl.Map({
      container: mapEl,
      style: STYLE_URL,
      center: [78.9629, 22.5937],
      zoom: 4.8,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    map.on('load', async () => {
      startRenderLoop();
      // Try API; if sleeping or failing, fall back to seed visuals so UI never looks dead.
      const ok = await initFromAPI(map).catch(err => (Debug.log('API init failed; using offline seed.', err), false));
      if (!ok) seedOffline(map);
    });

    window.AgenticTwins = { map, startRenderLoop, stopRenderLoop, setDashboard };

    document.getElementById('btnDemo')?.addEventListener('click', () => {
      speakTwice('Starting demo. If backend is sleeping, running offline seed mode.');
    });
    document.getElementById('btnVoice')?.addEventListener('click', () => toggleVoice());
    document.getElementById('btnZoom')?.addEventListener('click', () => toggleZoom());

  } catch (err) {
    Debug.log('Boot failed — check script path / style.json / CSP.', err);
  }
}

// ---- API bootstrap (with timeout + retry + circuit-breaker)
async function initFromAPI(map) {
  await pingHealth(); // warms Render; may fail quickly if sleeping
  const scenario = await fetchJSON('/api/scenario?v=2', { timeoutMs: 3500, retries: 2 });
  drawWarehouses(map, scenario.warehouses);
  drawCorridors(map, scenario.corridors);
  setDashboard(scenario.dashboard || []);
  // You can start truck engine here using scenario.trucks
  return true;
}

async function pingHealth() {
  return fetchJSON('/api/health', { timeoutMs: 2000, retries: 1 });
}

async function fetchJSON(pathOrUrl, opts = {}) {
  const { timeoutMs = 5000, retries = 0 } = opts;
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${API_BASE}${pathOrUrl}`;
  let attempt = 0, lastErr;
  while (attempt <= retries) {
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), timeoutMs);
      const res = await fetch(url, { signal: ctl.signal, credentials: 'omit' });
      clearTimeout(to);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 400 * (attempt + 1))); // backoff
      attempt++;
    }
  }
  throw lastErr;
}

// ---- Minimal draw helpers (non-blocking)
function drawWarehouses(map, warehouses = []) {
  const fc = { type: 'FeatureCollection', features: warehouses.map(w => ({
    type: 'Feature', properties: { name: w.name }, geometry: { type: 'Point', coordinates: w.lonlat }
  }))};
  if (!map.getSource('wh')) map.addSource('wh', { type: 'geojson', data: fc });
  else map.getSource('wh').setData(fc);
  if (!map.getLayer('wh-dots')) {
    map.addLayer({ id: 'wh-dots', type: 'circle', source: 'wh',
      paint: { 'circle-radius': 6, 'circle-color': '#33aaff', 'circle-stroke-color':'#0b0e14', 'circle-stroke-width': 2 } });
  }
}

function drawCorridors(map, corridors = []) {
  const fc = { type:'FeatureCollection', features: corridors.map((c,i)=>({
    type:'Feature', properties:{ id:i, status:c.status }, geometry:{ type:'LineString', coordinates:c.path }
  }))};
  if (!map.getSource('roads')) map.addSource('roads', { type:'geojson', data: fc });
  else map.getSource('roads').setData(fc);
  if (!map.getLayer('roads-line')) {
    map.addLayer({
      id:'roads-line', type:'line', source:'roads',
      paint:{
        'line-color': ['match', ['get','status'], 'normal', '#ffffff', 'disrupted', '#ff4d4d', 'reroute', '#3ddc84', /*default*/ '#aaaaaa'],
        'line-width': 3
      }
    });
  }
}

// ---- Offline seed when API is down
function seedOffline(map){
  drawWarehouses(map, [
    { name:'WH1 Delhi',     lonlat:[77.1025,28.7041] },
    { name:'WH2 Mumbai',    lonlat:[72.8777,19.0760] },
    { name:'WH3 Bangalore', lonlat:[77.5946,12.9716] },
    { name:'WH4 Hyderabad', lonlat:[78.4867,17.3850] },
    { name:'WH5 Kolkata',   lonlat:[88.3639,22.5726] },
  ]);
  drawCorridors(map, []);
  setDashboard([
    { wh:'WH1 Delhi', inv:120, in:30, out:10 },
    { wh:'WH2 Mumbai', inv:95, in:10, out:20 },
    { wh:'WH3 Bangalore', inv:110, in:15, out:15 },
    { wh:'WH4 Hyderabad', inv:80, in:5, out:25 },
    { wh:'WH5 Kolkata', inv:90, in:12, out:8 },
  ]);
}

// ---- Dashboard
function setDashboard(rows){
  const body = document.getElementById('dashBody');
  if (!body) return;
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="4" style="opacity:.6">No data</td></tr>`;
    return;
  }
  body.innerHTML = rows.map(r =>
    `<tr><td style="text-align:left">${r.wh}</td><td style="text-align:center">${r.inv}</td><td style="text-align:center">${r.in}</td><td style="text-align:center">${r.out}</td></tr>`
  ).join('');
}

// ---- Render loop
let rafId = null;
function startRenderLoop(){ if (rafId) return; const tick = () => { rafId = requestAnimationFrame(tick); }; rafId = requestAnimationFrame(tick); }
function stopRenderLoop(){ if (!rafId) return; cancelAnimationFrame(rafId); rafId = null; }

// ---- Voice + Zoom (UX)
let voiceOn = true, autoZoomOn = true;
function toggleVoice(){ voiceOn = !voiceOn; document.getElementById('voiceState').textContent = voiceOn ? 'On' : 'Off'; }
function speakTwice(text){ if (!voiceOn || !('speechSynthesis' in window)) return; const u=(t)=>new SpeechSynthesisUtterance(t); speechSynthesis.cancel(); speechSynthesis.speak(u(text)); setTimeout(()=>speechSynthesis.speak(u(text)), 1200); }
function toggleZoom(){ autoZoomOn = !autoZoomOn; document.getElementById('zoomState').textContent = autoZoomOn ? 'On' : 'Off'; }
