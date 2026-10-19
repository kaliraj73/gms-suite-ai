# GMS Suite AI

A lightweight, mobile-friendly AI starter for the GMS Suite, designed to be developed from Android Cloud Shell and built with GitHub Actions.

## Architecture

- **Frontend:** React + Vite, using native browser `fetch()`.
- **Backend:** Node.js + Express. Provider credentials stay on the server.
- **Providers:** OpenRouter free-priced model discovery and optional Gemini.
- **Safety:** input validation, JSON body size limits, security headers, rate limiting, provider timeouts, and bounded fallback.
- **CI:** separate frontend production build and backend test workflows.

> This is an AI-layer starter, not the complete rainfall-monitoring application. Rainfall extraction, DuckDB persistence, station matching, and reporting still need to be integrated.

## Layout

- `frontend/` — React/Vite interface and API client
- `server/` — Express API and provider adapters
- `.github/workflows/` — frontend and server CI workflows

## Requirements

Node.js 22+ and npm. Frontend and server are installed separately.

## Android Cloud Shell setup

From the repository root:

```bash
git checkout feature/ai-layer
git pull origin feature/ai-layer
cd server
npm install
cp .env.example .env
```

Edit `server/.env` and set `OPENROUTER_API_KEY` and/or `GEMINI_API_KEY`. Keep real keys server-side and never commit `.env`.

Start the API in the first terminal:

```bash
npm start
```

In a second terminal, from the repository root:

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

Open the URL printed by Vite. The Vite development proxy forwards `/api/*` to Express on port 8000 by default.

## Environment and free models

See [server/.env.example](server/.env.example). OpenRouter free models are filtered using provider-reported zero prompt and completion prices. Provider availability, pricing, free quotas, and rate limits can change. The `openrouter/free` router depends on provider availability.

Gemini is optional. Gemini models are not marked free unless their model IDs are explicitly listed in `GEMINI_FREE_MODELS`; only do this after checking the current pricing/quota terms for your own Google account. Gemini-to-OpenRouter fallback is opt-in.

## API endpoints

- `GET /api/ai/health` — health and boolean provider configuration; never returns keys.
- `GET /api/ai/models` — configured model catalogue.
- `POST /api/ai` — accepts `{ "model": "openrouter:openrouter/free", "prompt": "..." }` and returns generated output metadata.

Example test:

```bash
curl http://localhost:8000/api/ai/health
curl http://localhost:8000/api/ai/models
curl -X POST http://localhost:8000/api/ai \
  -H 'Content-Type: application/json' \
  -d '{"model":"openrouter:openrouter/free","prompt":"Explain a groundwater monitoring system."}'
```

## Local checks

```bash
cd server && npm install && npm test
cd ../frontend && npm install && npm run build
```

GitHub Actions runs these checks automatically. A build/test pass does not prove third-party API credentials, provider quotas, or live model availability work; test with your own keys.

## Security notes

- API keys are read by the backend only.
- Commit `.env.example`, never real `.env` files.
- Use HTTPS and a proper secret store when deploying.
- The in-memory rate limiter is for a single small server instance; use a shared limiter for multi-instance deployment.
