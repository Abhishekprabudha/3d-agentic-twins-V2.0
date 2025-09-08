# Agentic Twin v2.0

- **Frontend** `/frontend`: Map + Chat + Voice + Event client (WebSocket).
- **Backend** `/backend`: FastAPI event engine (WS `/events/ws`, `POST /command`).
- **Data** `/data`: Scenarios & baseline state.

Docs:
- `docs/CONTRACTS.md` — Event contract, intents, endpoints.
- `docs/DECISIONS.md` — Defaults & behavior rules.

Deploy (browser-only flows):
- Frontend: Netlify → point to `/frontend`.
- Backend: Render/Railway/Fly → point to `/backend` (Procfile + requirements included).

Update `frontend/app.js` → `BACKEND_URL` to your backend URL after deploy.
