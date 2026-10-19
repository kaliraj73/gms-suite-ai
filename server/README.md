# GMS Suite AI server

Requires Node.js 22 or newer.

```bash
npm install
cp .env.example .env
# Add your provider key(s) to .env, then:
npm start
```

The API listens on `0.0.0.0:8000` by default.

## Endpoints

- `GET /api/ai/health` — API state and boolean provider configuration only.
- `GET /api/ai/models` — configured model list.
- `POST /api/ai` — JSON body: `{ "model": "openrouter:openrouter/free", "prompt": "..." }`.

OpenRouter models are filtered by provider-reported zero prompt and completion prices. Model prices, quotas, rate limits, and availability can change. Gemini is not considered free unless its ID is explicitly listed in `GEMINI_FREE_MODELS`; verify current pricing/quota for your Google account. The default Gemini model is `gemini-3-flash`; override `GEMINI_MODEL` with a model verified for your account. Gemini-to-OpenRouter fallback is disabled unless `GEMINI_FALLBACK_ENABLED=true`.

## Tests

```bash
npm test
```

Never commit the real `.env` file. Use a secret store for hosted deployments.
