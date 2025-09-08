from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.staticfiles import StaticFiles
from typing import List
import asyncio

from models import Event
from commands import parse_to_event
from scenarios import run_scenario
from engine import engine

app = FastAPI(title="Agentic Twin v3.0")

# TODO: set to your Netlify origin after deploy
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # e.g., ["https://<yoursite>.netlify.app"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# ---- Serve scenario JSONs over HTTP (GET /scenarios/<name>.json) ----
app.mount("/scenarios", StaticFiles(directory="../data/scenarios", html=False), name="scenarios")

# ---- In-memory broadcast hub ----
class Hub:
    def __init__(self):
        self.seq = 0
        self.clients: List[WebSocket] = []
        self.ring: List[Event] = []

    async def broadcast(self, evt: Event):
        self.seq += 1
        evt.seq = self.seq
        self.ring.append(evt)
        if len(self.ring) > 500:
            self.ring = self.ring[-500:]

        dead = []
        for ws in list(self.clients):
            try:
                await ws.send_json(evt.model_dump())
            except Exception:
                dead.append(ws)
        for d in dead:
            try:
                self.clients.remove(d)
            except ValueError:
                pass

hub = Hub()

@app.get("/healthz")
async def healthz():
    return {"ok": True, "clients": len(hub.clients), "seq": hub.seq}

@app.websocket("/events/ws")
async def events_ws(ws: WebSocket):
    await ws.accept()
    hub.clients.append(ws)
    try:
        while True:
            # keep-alive
            await asyncio.sleep(60)
    except WebSocketDisconnect:
        pass
    finally:
        try:
            hub.clients.remove(ws)
        except ValueError:
            pass

@app.post("/command")
async def command(body: dict):
    text = (body.get("text") or "").strip()
    if not text:
        evt = Event(source="chat", type="error", payload={"message": "Empty command"})
        await hub.broadcast(evt)
        return JSONResponse({"ok": False, "events": [evt.model_dump()]}, status_code=400)

    evt = parse_to_event(text)
    await hub.broadcast(evt)
    return {"ok": True, "events": [evt.model_dump()]}

@app.post("/scenario/{name}/start")
async def scenario_start(name: str):
    asyncio.create_task(run_scenario(name, hub))
    return {"ok": True, "scenario": name}

@app.on_event("startup")
async def on_start():
    engine.start(hub)
