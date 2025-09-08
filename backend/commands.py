from models import Event

ALIAS = {
    "delhi":"WH1","wh1":"WH1","dli":"WH1",
    "mumbai":"WH2","wh2":"WH2","mum":"WH2",
    "hyderabad":"WH4","wh4":"WH4","hyd":"WH4"
}

def resolve(tok: str) -> str:
    if not tok: return tok
    t = tok.strip().lower()
    return ALIAS.get(t, t.upper())

def parse_to_event(text: str) -> Event:
    t = (text or "").strip().lower()
    if not t:
        return Event(source="chat", type="error", payload={"message":"Empty command"})

    if t.startswith("disrupt"):
        # naive: assume Delhi Hyderabad if not specified
        return Event(source="chat", type="disruption", payload={"a":"WH1","b":"WH4"})
    if t.startswith("fix") or t.startswith("correct"):
        return Event(source="chat", type="correct", payload={"a":"WH1","b":"WH4"})
    if t.startswith("reroute"):
        return Event(source="chat", type="reroute", payload={"path":["WH1","WH2","WH4"], "scope":"paused"})
    if t.startswith("status"):
        return Event(source="chat", type="query_result", payload={"kind":"status","answer":"(placeholder) status shown"})
    if t.startswith("zoom") or t.startswith("focus"):
        return Event(source="chat", type="focus", payload={"target":"WH4"})

    return Event(source="chat", type="clarify",
                 payload={"message":"Try: Disrupt Delhi–Hyderabad / Fix / Reroute Delhi → Mumbai → Hyderabad"})
