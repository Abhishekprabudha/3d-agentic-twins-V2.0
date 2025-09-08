import asyncio, json
from pathlib import Path
from typing import Any, Dict, List
from models import Event

SCEN_DIR = Path(__file__).resolve().parents[1] / "data" / "scenarios"

async def run_scenario(name: str, hub) -> None:
  """
  Load data/scenarios/<name>.json and emit events in sequence.
  File format:
  {
    "events": [
      {"delay_ms": 0,   "event": {"type": "...", "payload": {...}}},
      {"delay_ms": 800, "event": {"type": "...", "payload": {...}}}
    ]
  }
  """
  path = SCEN_DIR / f"{name}.json"
  if not path.exists():
    await hub.broadcast(Event(source="scenario", type="error",
                              payload={"message": f"Scenario {name} not found"}))
    return
  try:
    spec = json.loads(path.read_text(encoding="utf-8"))
  except Exception as e:
    await hub.broadcast(Event(source="scenario", type="error",
                              payload={"message": f"Scenario load failed: {e}"}))
    return

  for step in spec.get("events", []):
    await asyncio.sleep(max(0, int(step.get("delay_ms", 0))) / 1000)
    e = step.get("event", {})
    evt = Event(
      source="scenario",
      type=e.get("type","tick"),
      payload=e.get("payload", {})
    )
    await hub.broadcast(evt)
