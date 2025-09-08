import json, asyncio, pathlib
from models import Event

DATA_DIR = pathlib.Path(__file__).resolve().parents[1] / "data" / "scenarios"

async def run_scenario(name: str, hub):
    path = DATA_DIR / f"{name}.json"
    if not path.exists():
        await hub.broadcast(Event(source="scenario", type="error", payload={"message": f"Scenario not found: {name}"}))
        return
    spec = json.loads(path.read_text(encoding="utf-8"))
    start = asyncio.get_event_loop().time()
    for step in spec.get("steps", []):
        at = float(step.get("at_ms", 0))/1000.0
        # wait until the relative time
        while asyncio.get_event_loop().time() - start < at:
            await asyncio.sleep(0.01)
        ev_spec = step.get("event", {})
        evt = Event(source="scenario", type=ev_spec.get("type","tick"), payload=ev_spec.get("payload",{}))
        await hub.broadcast(evt)
