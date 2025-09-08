// frontend/app.js

// ---------------- CONFIG ----------------
const BACKEND_URL = "https://threed-agentic-twins-v2-0.onrender.com";

// self-ping every 4 minutes to keep backend alive
setInterval(() => {
  fetch(`${BACKEND_URL}/healthz`).catch(() => {
    console.log("backend still asleep…");
  });
}, 240000); // 240,000 ms = 4 min

// ---------------- GLOBAL STATE ----------------
let ws;
let chatLog = [];
let autoZoom = true;
let voiceOn = true;

// ---------------- UI ELEMENTS ----------------
const logPanel = document.getElementById("log");
const statsTable = document.getElementById("stats-body");
const chatInput = document.getElementById("chat-input");
const chatSend = document.getElementById("chat-send");
const demoBtn = document.getElementById("btn-demo");
const voiceBtn = document.getElementById("btn-voice");
const zoomBtn = document.getElementById("btn-zoom");

// ---------------- HELPERS ----------------
function logMessage(msg, type = "info") {
  const div = document.createElement("div");
  div.className = `log-entry ${type}`;
  div.textContent = msg;
  logPanel.prepend(div);
}

function speak(text) {
  if (!voiceOn) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.92;
  speechSynthesis.speak(u);
}

// ---------------- EVENT HANDLING ----------------
function handleEvent(ev) {
  if (ev.type === "inventory") {
    renderInventory(ev.payload);
  } else if (ev.type === "disruption") {
    logMessage(`⚠️ Disruption on ${ev.route}. Trucks paused.`, "warn");
    speak(`Disruption detected on ${ev.route}`);
  } else if (ev.type === "reroute") {
    logMessage(`✅ Detour active: ${ev.path.join(" → ")}`, "success");
    speak(`Traffic detoured via ${ev.path.join(" then ")}`);
  } else if (ev.type === "new_truck") {
    logMessage(`🚚 New truck ${ev.id}: ${ev.origin} → ${ev.dest}`, "info");
  } else {
    logMessage(`[event] ${JSON.stringify(ev)}`);
  }
}

function renderInventory(pred) {
  statsTable.innerHTML = "";
  for (const wh of Object.keys(pred)) {
    const r = pred[wh];
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${wh}</td>
      <td>${r.inv}</td>
      <td class="pos">+${r.in}</td>
      <td class="neg">-${r.out}</td>
    `;
    statsTable.appendChild(tr);
  }
}

// ---------------- CONNECTION ----------------
async function waitForHealthy() {
  for (let i = 0; i < 20; i++) {
    try {
      const r = await fetch(`${BACKEND_URL}/healthz`);
      if (r.ok) return true;
    } catch {}
    logMessage("(backend still waking… retrying)", "warn");
    await new Promise(r => setTimeout(r, 5000));
  }
  return false;
}

async function connectWS() {
  const healthy = await waitForHealthy();
  if (!healthy) {
    logMessage("❌ Backend not responding.", "error");
    return;
  }

  ws = new WebSocket(`${BACKEND_URL.replace("http", "ws")}/events/ws`);
  ws.onopen = () => logMessage("(connected to event stream)");
  ws.onmessage = (m) => {
    try {
      const ev = JSON.parse(m.data);
      handleEvent(ev);
    } catch (e) {
      console.error("bad event", e);
    }
  };
  ws.onclose = () => {
    logMessage("(connection closed, retrying…)", "warn");
    setTimeout(connectWS, 5000);
  };
}

// ---------------- COMMAND SEND ----------------
function sendCommand(txt) {
  fetch(`${BACKEND_URL}/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: txt })
  });
  logMessage(`You: ${txt}`, "user");
}

// ---------------- UI WIRING ----------------
chatSend.onclick = () => {
  if (!chatInput.value) return;
  sendCommand(chatInput.value);
  chatInput.value = "";
};

demoBtn.onclick = () => {
  sendCommand("demo");
};

voiceBtn.onclick = () => {
  voiceOn = !voiceOn;
  voiceBtn.textContent = "Voice: " + (voiceOn ? "On" : "Off");
};

zoomBtn.onclick = () => {
  autoZoom = !autoZoom;
  zoomBtn.textContent = "Auto-Zoom: " + (autoZoom ? "On" : "Off");
};

// ---------------- START ----------------
connectWS();
