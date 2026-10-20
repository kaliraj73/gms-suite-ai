import { createOpenRouterProvider } from './openrouter.js';
import { createGeminiProvider } from './gemini.js';

export function createAiService({ env = process.env, fetchImpl = fetch } = {}) {
  const timeoutMs = Math.max(1000, Math.min(60000, Number.parseInt(env.PROVIDER_TIMEOUT_MS || '25000', 10) || 25000));
  const openrouter = createOpenRouterProvider({ apiKey: env.OPENROUTER_API_KEY, env, fetchImpl, timeoutMs });
  const gemini = createGeminiProvider({ apiKey: env.GEMINI_API_KEY, env, fetchImpl, timeoutMs });
  let openrouterCache = { at: 0, models: [] };
  let geminiCache = { at: 0, models: [] };
  const cacheTtlMs = Math.max(0, Number.parseInt(env.MODEL_CACHE_TTL_MS || '60000', 10));

  async function cachedModels(provider, cache, save) {
    if (!provider.configured) return [];
    if (Date.now() - cache.at < cacheTtlMs) return cache.models;
    const models = await provider.fetchModels();
    save({ at: Date.now(), models });
    return models;
  }
  const openRouterFreeModels = () => cachedModels(openrouter, openrouterCache, (next) => { openrouterCache = next; });
  const geminiModels = () => cachedModels(gemini, geminiCache, (next) => { geminiCache = next; });

  async function listModels({ refresh = false } = {}) {
    if (refresh) { openrouterCache = { at: 0, models: [] }; geminiCache = { at: 0, models: [] }; }
    const warnings = [];
    let freeModels = [];
    let discoveredGemini = [];
    if (openrouter.configured) {
      try { freeModels = await openRouterFreeModels(); }
      catch (error) { warnings.push(error?.status === 401 ? 'OpenRouter authentication failed (HTTP 401). Check the server-side key and restart the backend.' : 'OpenRouter model discovery is temporarily unavailable.'); }
    }
    if (gemini.configured) {
      try { discoveredGemini = await geminiModels(); }
      catch (error) {
        warnings.push(error?.status === 401 || error?.status === 403
          ? 'Gemini model discovery was denied. Check API key restrictions and account access.'
          : error?.status === 504 ? 'Gemini model discovery timed out. Retry refresh or check Cloud Shell network access.'
          : 'Gemini model discovery is temporarily unavailable.');
      }
    }
    const models = [];
    if (openrouter.configured) {
      models.push({ id: 'openrouter:openrouter/free', name: 'OpenRouter Free Router', provider: 'openrouter', free: true, label: 'OpenRouter Free Router (provider availability varies)' });
      models.push(...freeModels.map((m) => ({ ...m, id: `openrouter:${m.id}` })));
    }
    models.push(...discoveredGemini.map((m) => ({ ...m, id: `gemini:${m.id}` })));
    return { models, providers: { openrouter: openrouter.configured, gemini: gemini.configured }, warnings };
  }

  async function generate({ model, prompt, mode = 'openrouter' }) {
    const requested = model || (openrouter.configured ? 'openrouter:openrouter/free' : '');
    if (!requested) { const error = new Error('No provider configured. Add OPENROUTER_API_KEY or GEMINI_API_KEY to server/.env.'); error.status = 503; throw error; }
    const colon = requested.indexOf(':');
    const provider = colon > 0 ? requested.slice(0, colon) : 'openrouter';
    const modelId = colon > 0 ? requested.slice(colon + 1) : requested;
    if (!['openrouter', 'gemini'].includes(provider)) { const error = new Error('Unsupported provider. Choose an OpenRouter or Gemini model.'); error.status = 400; throw error; }
    if (mode === 'openrouter' && provider !== 'openrouter') { const error = new Error('Select an OpenRouter model in OpenRouter-only mode.'); error.status = 400; throw error; }
    if (mode === 'gemini' && provider !== 'gemini') { const error = new Error('Select a Gemini model in Gemini-only mode.'); error.status = 400; throw error; }
    if (provider === 'gemini' && !gemini.configured) { const error = new Error('Gemini is not configured. Add GEMINI_API_KEY to server/.env.'); error.status = 503; throw error; }
    if (provider === 'openrouter' && !openrouter.configured) { const error = new Error('OpenRouter is not configured. Add OPENROUTER_API_KEY to server/.env.'); error.status = 503; throw error; }

    const attempts = [];
    if (provider === 'gemini') {
      // Validate against the live account catalogue; a stale/deprecated ID never enters retry/fallback.
      const liveModels = await geminiModels();
      if (!liveModels.some((item) => item.id === modelId)) {
        const error = new Error('This Gemini model is not in the current account catalogue. Refresh models and choose a listed model.'); error.status = 404; throw error;
      }
      attempts.push({ provider: 'gemini', model: modelId, run: () => gemini.chat({ model: modelId, prompt }) });
    } else if (modelId === 'openrouter/free') {
      attempts.push({ provider: 'openrouter', model: modelId, run: () => openrouter.chat({ model: modelId, prompt }) });
      try {
        const freeModels = await openRouterFreeModels();
        attempts.push(...freeModels.slice(0, 4).map((item) => ({ provider: 'openrouter', model: item.id, run: () => openrouter.chat({ model: item.id, prompt }) })));
      } catch { /* keep free router as the primary option */ }
    } else {
      const freeModels = await openRouterFreeModels();
      if (!freeModels.some((item) => item.id === modelId)) {
        const error = new Error('This model is not currently reported as free by OpenRouter. Refresh the model list.'); error.status = 400; throw error;
      }
      attempts.push({ provider: 'openrouter', model: modelId, run: () => openrouter.chat({ model: modelId, prompt }) });
      attempts.push(...freeModels.filter((item) => item.id !== modelId).slice(0, 3).map((item) => ({ provider: 'openrouter', model: item.id, run: () => openrouter.chat({ model: item.id, prompt }) })));
    }

    if (mode === 'both') {
      if (provider === 'gemini' && openrouter.configured) {
        try {
          const freeModels = await openRouterFreeModels();
          attempts.push(...freeModels.slice(0, 3).map((item) => ({ provider: 'openrouter', model: item.id, run: () => openrouter.chat({ model: item.id, prompt }) })));
        } catch { /* preserve primary provider */ }
        attempts.push({ provider: 'openrouter', model: 'openrouter/free', run: () => openrouter.chat({ model: 'openrouter/free', prompt }) });
      } else if (provider === 'openrouter' && gemini.configured) {
        try {
          const liveModels = await geminiModels();
          const preferred = env.GEMINI_MODEL;
          const selected = liveModels.find((item) => item.id === preferred) || liveModels[0];
          if (selected) attempts.push({ provider: 'gemini', model: selected.id, run: () => gemini.chat({ model: selected.id, prompt }) });
        } catch { /* no Gemini fallback if discovery fails */ }
      }
    }

    let lastError;
    for (let i = 0; i < attempts.length; i += 1) {
      try {
        const output = await attempts[i].run();
        return { output, provider: attempts[i].provider, model: attempts[i].model, fallbackUsed: i > 0 };
      } catch (error) {
        lastError = error;
        // A bad model, auth denial, or malformed request is not fixed by trying more models.
        if ([400, 401, 403, 404].includes(error?.status)) break;
      }
    }
    const status = [400, 401, 403, 404, 429, 503, 504].includes(lastError?.status) ? lastError.status : 502;
    const message = lastError?.message || 'The provider could not complete the request. Check provider status and try again.';
    const error = new Error(message); error.status = status; throw error;
  }

  return { listModels, generate, health: () => ({ status: 'ok', providers: { openrouter: openrouter.configured, gemini: gemini.configured } }) };
}
