import re
from typing import List, Tuple, Optional, Dict
from models import Event

# --- Canonical node aliases (keep in sync with docs/CONTRACTS.md) ---
ALIAS = {
    "delhi": "WH1", "wh1": "WH1", "dli": "WH1",
    "mumbai": "WH2", "wh2": "WH2", "mum": "WH2", "bombay": "WH2",
    "bangalore": "WH3", "bengaluru": "WH3", "blr": "WH3", "wh3": "WH3",
    "hyderabad": "WH4", "hyd": "WH4", "wh4": "WH4",
    "kolkata": "WH5", "calcutta": "WH5", "ccu": "WH5", "wh5": "WH5",
}

# Minimal neighbor knowledge for clarify suggestions (extend as your graph grows)
NEIGHBORS: Dict[str, List[str]] = {
    "WH1": ["WH2", "WH4"],   # Delhi –(Mumbai, Hyderabad)
    "WH2": ["WH1", "WH4"],   # Mumbai –(Delhi, Hyderabad)
    "WH3": ["WH2", "WH4"],   # Bangalore –(Mumbai, Hyderabad) [demo]
    "WH4": ["WH1", "WH2", "WH3", "WH5"],  # Hyderabad –(...) [demo]
    "WH5": ["WH2", "WH4"],   # Kolkata –(Mumbai, Hyderabad) [demo]
}

# --- Helpers -----------------------------------------------------------------

def _canon_node(tok: str) -> Optional[str]:
    if not tok: return None
    t = tok.strip().lower()
    # strip punctuation
    t = re.sub(r"[^\w\-]", "", t)
    return ALIAS.get(t) or (t.upper() if re.fullmatch(r"WH\d+", t.upper()) else None)

def _extract_nodes_freeform(text: str) -> List[str]:
    """
    Pull nodes appearing as words like 'Delhi', 'WH2', etc. Order preserved.
    """
    nodes: List[str] = []
    for raw in re.findall(r"[A-Za-z]+|\bWH\d+\b", text, flags=re.IGNORECASE):
        c = _canon_node(raw)
        if c and (not nodes or nodes[-1] != c):
            nodes.append(c)
    return nodes

def _extract_path(text: str) -> List[str]:
    """
    Try to parse an explicit path like: A -> B -> C (supports →, ->, -, —, to).
    Falls back to freeform node list.
    """
    # Normalize separators
    norm = (
        text.replace("→", "->")
            .replace("—", "-")
            .replace(" to ", " -> ")
            .replace("–", "-")
    )
    # Split on arrows first
    if "->" in norm:
        parts = [p.strip() for p in norm.split("->") if p.strip()]
        nodes = [_canon_node(p) for p in parts]
        return [n for n in nodes if n]
    # Split on hyphens for pairs like "Delhi - Hyderabad"
    if "-" in norm:
        parts = [p.strip() for p in norm.split("-") if p.strip()]
        nodes = [_canon_node(p) for p in parts]
        if len([n for n in nodes if n]) >= 2:
            return [n for n in nodes if n]
    # Fallback: freeform scan
    return _extract_nodes_freeform(text)

def _clarify_for_single(anchor: str, verb: str) -> Event:
    """
    If user gave only one node (e.g., 'Disrupt Mumbai route'), offer corridor options.
    """
    opts = []
    for nb in NEIGHBORS.get(anchor, []):
        opts.append(f"{verb} {anchor}–{nb}")
    if not opts:
        opts = ["Cancel"]
    return Event(
        source="chat",
        type="clarify",
        payload={
            "message": f"Which corridor by {anchor}?",
            "options": opts[:3]  # keep concise
        }
    )

def _status_answer(nodes: List[str]) -> dict:
    """
    Build a placeholder status answer object per CONTRACTS. Replace with real
    lookup once you have backend state. For now, return structure the frontend
    can render easily.
    """
    ans = {}
    for n in nodes:
        ans[n] = {"inv": None, "in": None, "out": None, "note": "status placeholder"}
    return ans

# --- Public API ---------------------------------------------------------------

def parse_to_event(text: str) -> Event:
    """
    Parse a chat command into a canonical Event per docs/CONTRACTS.md.
    """
    t = (text or "").strip()
    if not t:
        return Event(source="chat", type="error", payload={"message": "Empty command"})

    low = t.lower()

    # 1) DISRUPT <A [-> B]> | <A B> | <A-B>
    if low.startswith("disrupt"):
        nodes = _extract_path(t)
        if len(nodes) >= 2:
            a, b = nodes[0], nodes[1]
            return Event(source="chat", type="disruption", payload={"a": a, "b": b})
        if len(nodes) == 1:
            return _clarify_for_single(nodes[0], "Disrupt")
        return Event(source="chat", type="clarify",
                     payload={"message": "Which corridor should I disrupt?",
                              "options": ["Disrupt Delhi–Hyderabad", "Disrupt Kolkata–Mumbai", "Cancel"]})

    # 2) CORRECT / FIX <A [-> B]>
    if low.startswith("correct") or low.startswith("fix"):
        nodes = _extract_path(t)
        if len(nodes) >= 2:
            a, b = nodes[0], nodes[1]
            return Event(source="chat", type="correct", payload={"a": a, "b": b})
        if len(nodes) == 1:
            return _clarify_for_single(nodes[0], "Correct")
        # If none specified, we could assume "last corridor", but without session state, clarify:
        return Event(source="chat", type="clarify",
                     payload={"message": "Which corridor should I correct?",
                              "options": ["Correct Delhi–Hyderabad", "Correct Kolkata–Mumbai", "Cancel"]})

    # 3) REROUTE <A -> ... -> Z>
    if low.startswith("reroute") or "reroute" in low:
        path = _extract_path(t)
        # Require at least a 3-point path for a meaningful detour
        if len(path) >= 3:
            return Event(source="chat", type="reroute", payload={"path": path, "scope": "paused"})
        # If only 2 nodes or ambiguous, clarify with common midpoints
        if len(path) == 2:
            a, b = path
            mids = NEIGHBORS.get(a, [])[:2]
            opts = [f"Reroute {a} -> {m} -> {b}" for m in mids] or [f"Reroute {a} -> WH2 -> {b}"]
            return Event(source="chat", type="clarify", payload={"message": "Which detour?", "options": opts})
        return Event(source="chat", type="clarify",
                     payload={"message": "Give me a path like: Reroute Delhi -> Mumbai -> Hyderabad",
                              "options": ["Reroute WH1 -> WH2 -> WH4", "Cancel"]})

    # 4) STATUS Mumbai, Kolkata
    if low.startswith("status"):
        # split by comma if present
        # keep order; canonicalize nodes
        parts = [p.strip() for p in re.split(r"[,\s]+", low.replace("status", ""), maxsplit=0) if p.strip()]
        nodes = []
        for p in parts:
            c = _canon_node(p)
            if c and c not in nodes:
                nodes.append(c)
        if not nodes:
            # try freeform extraction
            nodes = _extract_nodes_freeform(t)
        if nodes:
            return Event(source="chat", type="query_result",
                         payload={"kind": "status", "answer": _status_answer(nodes)})
        return Event(source="chat", type="clarify",
                     payload={"message": "Which locations for status?",
                              "options": ["Status Mumbai, Kolkata", "Status Delhi, Hyderabad", "Cancel"]})

    # 5) WHERE / WHERE IS T7 ?
    if low.startswith("where"):
        m = re.search(r"\b(t\d+)\b", low)
        if m:
            truck_id = m.group(1).upper()
            return Event(source="chat", type="query_result",
                         payload={"kind": "where", "answer": f"{truck_id}: location lookup not yet implemented"})
        return Event(source="chat", type="clarify",
                     payload={"message": "Which truck? e.g., Where is T7", "options": ["Where is T1", "Where is T7", "Cancel"]})

    # 6) FOCUS / ZOOM Hyderabad
    if low.startswith("focus") or low.startswith("zoom"):
        nodes = _extract_nodes_freeform(t)
        if nodes:
            return Event(source="chat", type="focus", payload={"target": nodes[0]})
        return Event(source="chat", type="clarify",
                     payload={"message": "Focus where?", "options": ["Focus Hyderabad", "Focus Mumbai", "Cancel"]})

    # 7) HELP
    if low in ("help", "what can i ask", "?", "commands"):
        return Event(source="chat", type="query_result",
                     payload={"kind": "help", "answer":
                              "Try: Disrupt Delhi–Hyderabad · Fix Delhi–Hyderabad · Reroute Delhi -> Mumbai -> Hyderabad · Status Mumbai, Kolkata · Where is T7 · Focus Hyderabad"})

    # Fallback
    return Event(
        source="chat",
        type="clarify",
        payload={
            "message": "I didn't quite get that.",
            "options": [
                "Disrupt Delhi–Hyderabad",
                "Reroute Delhi -> Mumbai -> Hyderabad",
                "Status Mumbai, Kolkata"
            ]
        }
    )
