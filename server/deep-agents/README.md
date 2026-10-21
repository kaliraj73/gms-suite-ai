# Optional LangChain Deep Agents service

This Python sidecar is opt-in and separate from the existing Express AI provider service.

## Safety and defaults

- Set `ENABLE_DEEP_AGENTS=false` unless you intentionally want to enable it.
- Bind Uvicorn to `127.0.0.1`, not `0.0.0.0`, unless you have a secured private network and appropriate firewall rules.
- Configure a long random `DEEP_AGENTS_SHARED_TOKEN` in the same server environment for both services.
- Do not commit `server/.env` or real API keys.
- The agent uses the default state-backed workspace; no host filesystem or shell sandbox is configured. Do not add unrestricted tools without a separate security review.
- The sidecar uses provider keys server-side; it does not return raw provider exception bodies.

## Install and run

From the repository root:

```bash
python3 -m venv server/deep-agents/.venv
server/deep-agents/.venv/bin/pip install -r server/deep-agents/requirements.txt
```

Set these values in `server/.env` (use the same token in both processes):

```env
ENABLE_DEEP_AGENTS=false
DEEP_AGENTS_URL=http://127.0.0.1:8010
DEEP_AGENTS_SHARED_TOKEN=replace-with-a-long-random-secret
DEEP_AGENTS_TIMEOUT_MS=50000
DEEP_AGENTS_PROVIDER=openrouter
DEEP_AGENTS_OPENROUTER_MODEL=openrouter/free
DEEP_AGENTS_GEMINI_MODEL=gemini-2.5-flash
```

Only after installing dependencies and deciding to enable the feature, change `ENABLE_DEEP_AGENTS=true` and run the sidecar in a separate terminal:

```cd server/deep-agents
../deep-agents/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8010
```

The Express endpoint is `POST /api/ai/agent`, with the same `prompt`, `model`, and `mode` fields as the existing AI endpoint. It returns an agent response only; standard `POST /api/ai` behavior remains unchanged.

## Model format

Use `openrouter:openrouter/free`, `openrouter:provider/model-id`, or `gemini:gemini-2.5-flash`. Confirm the selected model supports tool calling. Provider catalogues and free-model availability change over time.
