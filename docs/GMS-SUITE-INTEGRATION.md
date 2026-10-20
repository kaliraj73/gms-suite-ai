# Connect the GMS Suite dashboard to GMS AI Studio

The AI Studio opens the existing GMS dashboard in a separate tab. Set `VITE_GMS_SUITE_URL` at frontend build time if the Cloud Shell Web Preview URL changes. The dashboard URL is public configuration; never put API keys in a `VITE_*` variable.

## Service architecture

The React/Vite AI Studio, Node API, and GMS dashboard remain separate services so the dashboard's existing OCR, weather summary, FORMAT-II, Excel/PDF processing, and report workflows are preserved.

## Ports

- AI API: port 8000 by default (override with `PORT`)
- GMS dashboard: port 8001
- Vite frontend: port 5173 in development

If another process already uses port 8000, start the AI API with `PORT=8002 npm start`, then point Vite's proxy at it using `VITE_API_TARGET=http://127.0.0.1:8002`. In separate production hosts, set the frontend build variable `VITE_API_BASE_URL` to the reachable API origin and configure server CORS for the frontend origin. Keep backend keys only in server environment variables or secret management.

## Run in Android Cloud Shell

Terminal 1 — backend:

```bash
cd server
npm install
# Keep keys locally in server/.env; never paste them into chats or frontend variables.
PORT=8000 npm start
```

Terminal 2 — frontend:

```bash
cd frontend
npm install
VITE_API_TARGET=http://127.0.0.1:8000 npm run dev -- --host 0.0.0.0
```

If port 8000 is occupied by another service, choose an unused port (for example 8002) and set the same port for the frontend's `VITE_API_TARGET`. Do not blindly kill all processes on a port; identify the PID and command first. For production UI/API hosted on different origins, set `VITE_API_BASE_URL` during the build and configure CORS on the backend.

Run the existing GMS dashboard separately on port 8001 using its own trusted runtime directory and startup instructions. Do not mix its DuckDB databases, uploads, screenshots, or generated exports into this repository.

## Verification

- Run `npm test` in `server`.
- Run `npm run build` in `frontend`.
- Verify `GET /api/ai/health` exposes only booleans for configured providers.
- Verify `GET /api/ai/models?refresh=1` refreshes model catalogue data.
- Test normal and occupied-port startup using non-sensitive test values.
- Manually test the frontend and dashboard preview URLs with non-sensitive sample data.

The AI buttons provide guided prompts; they do not directly write to DuckDB or master workbooks. A future data-aware integration should use authenticated, validated APIs and audit logging rather than exposing database files to browsers.
