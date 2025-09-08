# Agentic Twin v3.0 — Defaults & Decisions

- Voice: **ON** by default (client Web Speech; user can mute; stored in localStorage).
- Auto-Zoom: **ON** by default (fit to corridor/path on big events).
- Engine cadence: **~1 event/sec** (coalesced in UI per frame).
- Truck cap: **60** (engine retires oldest beyond cap).
- Reroute scope default: **"paused"** (affects only paused trucks unless specified).
- User override window: **60s** (engine avoids auto-changing a corridor touched by the user within this window).
- Event ordering: frontend keeps `lastSeq` and ignores any event where `seq <= lastSeq`.
- Fallback: if backend stream is down, frontend can optionally switch to a local mini-engine (demo mode) until the stream returns.
