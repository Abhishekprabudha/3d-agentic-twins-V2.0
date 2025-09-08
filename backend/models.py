from pydantic import BaseModel, Field
from typing import Any, Dict, Literal
import time, uuid

EventSource = Literal["engine","chat","scenario"]
EventType = Literal[
    "disruption","correct","reroute","inventory_delta",
    "truck_add","truck_update","warehouse_add","lane_add",
    "focus","query_result","clarify","error","tick"
]

class Event(BaseModel):
    id: str = Field(default_factory=lambda: f"evt_{uuid.uuid4().hex[:8]}")
    ts: int = Field(default_factory=lambda: int(time.time() * 1000))
    seq: int = 0
    source: EventSource = "engine"
    type: EventType
    payload: Dict[str, Any] = {}
    version: int = 1
