import asyncio, random
from models import Event

class Engine:
    def __init__(self):
        self._task = None
        self._running = False

    async def _loop(self, hub):
        self._running = True
        while self._running:
            await asyncio.sleep(1.0)  # ~1 event/sec
            roll = random.random()
            if roll < 0.20:
                evt = Event(source="engine", type="disruption", payload={"a":"WH1","b":"WH4"})
            elif roll < 0.40:
                evt = Event(source="engine", type="reroute", payload={"path":["WH1","WH2","WH4"], "scope":"paused"})
            elif roll < 0.60:
                evt = Event(source="engine", type="inventory_delta", payload={"wh":"WH2","delta": random.choice([+10,-8,+6,-5]), "reason":"pulse"})
            elif roll < 0.80:
                evt = Event(source="engine", type="truck_add", payload={"id": f"T{random.randint(20,99)}", "origin":"WH2", "destination":"WH4"})
            else:
                evt = Event(source="engine", type="tick", payload={})
            await hub.broadcast(evt)

    def start(self, hub):
        if not self._task:
            self._task = asyncio.create_task(self._loop(hub))

    def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            self._task = None

engine = Engine()
