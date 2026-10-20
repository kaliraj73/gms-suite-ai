import { createOpenRouterProvider } from './openrouter.js';
import { createGeminiProvider } from './gemini.js';

export function createAiService({ env = process.env, fetchImpl = fetch } = {}) {
  const timeoutMs = Math.max(1000, Number.parseInt(env.PROVIDER_TIMEOUT_MS || '25000', 10));
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

  async function openRouterFreeModels() {
    return cachedModels(openrouter, openrouterCache, (next) => { openrouterCache = next; });
  }
  async function geminiModels() {
    return cachedModels(gemini, geminiCache, (next) => { geminiCache = next; });
  }

  async function listModels({ refresh = false } = {}) {
    if (refresh) {
      openrouterCache = { at: 0, models: [] };
      geminiCache = { at: 0, models: [] };
    }
    const warnings = [];
    let freeModels = [];
    let discoveredGemini = [];
    if (openrouter.configured) {
      try { freeModels = await openRouterFreeModels(); }
      catch { warnings.push('OpenRouter model discovery is temporarily unavailable. The free router may still work.'); }
    }
    if (gemini.configured) {
      try { discoveredGemini = await geminiModels(); }
      catch (error) {
        warnings.push(error?.status === 401 || error?.status === 403
          ? 'Gemini model discovery was denied. Check GEMINI_API_KEY restrictions and API access.'
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
    if (!requested) {
      const error = new Error('No provider configured. Add OPENROUTER_API_KEY or GEMINI_API_KEY to server/.env.');
      error.status = 503;
      throw error;
    }
    const colon = requested.indexOf(':');
    const provider = colon > 0 ? requested.slice(0, colon) : 'openrouter';
    const modelId = colon > 0 ? requested.slice(colon + 1) : requested;
    const attempts = [];

    if (provider === 'openrouter') {
      if (!openrouter.configured) {
        const error = new Error('OpenRouter is not configured. Add OPENROUTER_API_KEY to server/.env.');
        error.status = 503; throw error;
      }
      if (modelId === 'openrouter/free') {
        attempts.push({ provider: 'openrouter', model: modelId, run: () => openrouter.chat({ model: modelId, prompt }) });
        try {
          const freeModels = await openRouterFreeModels();
          attempts.push(...freeModels.slice(0, 4).map((m) => ({
            provider: 'openrouter', model: m.id, run: () => openrouter.chat({ model: m.id, prompt }),
          })));
        } catch { /* keep router attempt available */ }
      } else {
        let freeModels;
        try { freeModels = await openRouterFreeModels(); }
        catch {
          const error = new Error('Could not validate free models with OpenRouter. Refresh models and try again.');
          error.status = 502; throw error;
        }
        if (!freeModels.some((m) => m.id === modelId)) {
          const error = new Error('This model is not currently reported as free by OpenRouter. Refresh the model list.');
          error.status = 400; throw error;
        }
        attempts.push({ provider: 'openrouter', model: modelId, run: () => openrouter.chat({ model: modelId, prompt }) });
        attempts.push(...freeModels.filter((m) => m.id !== modelId).slice(0, 3).map((m) => ({
          provider: 'openrouter', model: m.id, run: () => openrouter.chat({ model: m.id, prompt }),
        })));
      }
    } else if (provider === 'gemini') {
      if (!gemini.configured) {
        const error = new Error('Gemini is not configured. Add GEMINI_API_KEY to server/.env.');
        error.status = 503; throw error;
      }
      attempts.push({ provider: 'gemini', model: modelId, run: () => gemini.chat({ model: modelId, prompt }) });
      if (env.GEMINI_FALLBACK_ENABLED === 'true' && openrouter.configured) {
        let freeModels = [];
        try { freeModels = await openRouterFreeModels(); } catch { /* router remains fallback */ }
        attempts.push(...freeModels.slice(0, 3).map((m) => ({
          provider: 'openrouter', model: m.id, run: () => openrouter.chat({ model: m.id, prompt }),
        })));
        attempts.push({ provider: 'openrouter', model: 'openrouter/free', run: () => openrouter.chat({ model: 'openrouter/free', prompt }) });
      }
    } else {
      const error = new Error('Unsupported provider. Choose an OpenRouter or Gemini model.');
      error.status = 400; throw error;
    }

    if (mode === 'openrouter' && provider !== 'openrouter') {
      const error = new Error('Select an OpenRouter model in OpenRouter-only mode.');
      error.status = 400; throw error;
    }
    if (mode === 'gemini' && provider !== 'gemini') {
      const error = new Error('Select a Gemini model in Gemini-only mode.');
      error.status = 400; throw error;
    }
    if (mode === 'both') {
      if (provider === 'openrouter' && gemini.configured) {
        const geminiModel = env.GEMINI_MODEL || 'gemini-2.5-flash';
        attempts.push({ provider: 'gemini', model: geminiModel, run: () => gemini.chat({ model: geminiModel, prompt }) });
      } else if (provider === 'gemini' && openrouter.configured) {
        try {
          const freeModels = await openRouterFreeModels();
          attempts.push(...freeModels.slice(0, 3).map((m) => ({
            provider: 'openrouter', model: m.id, run: () => openrouter.chat({ model: m.id, prompt }),
          })));
        } catch { /* try router last */ }
        attempts.push({ provider: 'openrouter', model: 'openrouter/free', run: () => openrouter.chat({ model: 'openrouter/free', prompt }) });
      }
    }

    let lastError;
    for (let i = 0; i < attempts.length; i += 1) {
      try {
        const output = await attempts[i].run();
        return { output, provider: attempts[i].provider, model: attempts[i].model, fallbackUsed: i > 0 };
      } catch (error) {
        lastError = error;
        // Authentication/configuration failures are not model-specific; don't keep retrying with the same credential.
        if ([401, 403].includes(error?.status)) break;
      }
    }
    const status = [400, 401, 403, 429, 503].includes(lastError?.status) ? lastError.status : 502;
    const message = lastError?.name === 'TimeoutError' || lastError?.name === 'AbortError'
      ? 'The provider timed out. Try again or choose another model.'
      : status === 400 ? (lastError?.message || 'The provider rejected this model or request. Check the model ID and request limits.')
      : status === 401 ? 'Provider authentication failed (HTTP 401). Check the API key in server/.env, then restart the backend.'
      : status === 403 ? 'Provider access was denied (HTTP 403). Check model access, API restrictions, billing, and account eligibility.'
      : status === 429 ? 'Provider quota or rate limit reached (HTTP 429). Wait, check quota, or try another model.'
      : status === 503 ? (lastError?.message || 'Provider is not configured.')
      : lastError?.message || 'The provider could not complete the request. Check backend logs and provider status.';
    const error = new Error(message); error.status = status; throw error;
  }

  return {
    listModels,
    generate,
    health: () => ({ status: 'ok', providers: { openrouter: openrouter.configured, gemini: gemini.configured } }),
  };
}
