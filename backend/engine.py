import asyncio, random
from models import Event

class Engine:
    def __init__(self):
        self._task = None
        self._running = False

    async def _loop(self, hub):
        self._running = True
        while self._running:
            await asyncio.sleep(3.0)
            roll = random.random()
            if roll < 0.25:
                evt = Event(source="engine", type="disruption", payload={"a":"WH1","b":"WH4"})
            elif roll < 0.45:
                evt = Event(source="engine", type="reroute", payload={"path":["WH1","WH2","WH4"], "scope":"paused"})
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
