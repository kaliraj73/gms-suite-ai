# GMS Suite AI server

Requires Node.js 22 or newer.

```bash
npm install
cp .env.example .env
# Add provider key(s) locally to .env, then:
npm start
```

The API binds to `0.0.0.0` and listens on port 8000 by default. Set `PORT=8002` if another service already occupies port 8000. The startup message states the selected port; an occupied port produces an actionable error. Stop only the process you have identified as the stale GMS AI server—do not terminate unrelated Cloud Shell services.

## Endpoints

- `GET /api/ai/health` — API state and boolean provider configuration only.
- `GET /api/ai/models` — live provider model lists, cached briefly on the backend.
- `GET /api/ai/models?refresh=1` — force fresh provider catalogue requests.
- `POST /api/ai` — JSON body: `{ "model": "openrouter:openrouter/free", "prompt": "..." }`.

### Authentication and model discovery

OpenRouter chat and catalogue requests use `Authorization: Bearer ...`; provider error response bodies are deliberately not returned to clients. For HTTP 401, verify that the key is the active OpenRouter API key, remove accidental quotes/whitespace, ensure it is loaded from `server/.env`, and restart the backend. Never print the key while diagnosing. The Gemini model list is retrieved from Google's live `models` endpoint and filtered to models that support `generateContent`. Gemini is not labelled free unless its ID is present in `GEMINI_FREE_MODELS`; check current account quota/pricing.

## Cloud Shell connectivity

In development, Vite serves on `0.0.0.0:5173` and proxies `/api` to `http://127.0.0.1:8000` by default. If the backend uses another port, set `VITE_API_TARGET=http://127.0.0.1:8002` before starting Vite. In a production deployment, set `VITE_API_BASE_URL` to the public backend origin if the UI and API are on different hosts; that API must allow the frontend origin with appropriate CORS settings. Do not set a public API base URL to `localhost`.

## Tests

```bash
npm test
```

Never commit the real `.env` file. Use a secret store for hosted deployments.
