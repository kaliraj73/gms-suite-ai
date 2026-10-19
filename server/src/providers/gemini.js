const API = 'https://generativelanguage.googleapis.com/v1beta';

function apiError(message, status = 502) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// These are requested UI choices, but the live Gemini API catalogue is the
// source of truth: do not expose a model option that the API key cannot see.
const PREFERRED_MODELS = [
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite' },
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite' },
  { id: 'gemma-4-26b', name: 'Gemma 4 26B' },
  { id: 'gemma-4-31b', name: 'Gemma 4 31B' },
];

export function createGeminiProvider({ apiKey, env = process.env, fetchImpl = fetch, timeoutMs = 25000 }) {
  const configured = Boolean(apiKey);
  const defaultModel = env.GEMINI_MODEL || 'gemini-3.8-flash';
  const explicitlyFree = new Set((env.GEMINI_FREE_MODELS || '').split(',').map((v) => v.trim()).filter(Boolean));

  async function fetchModels() {
    if (!configured) return [];
    const response = await fetchImpl(`${API}/models?key=${encodeURIComponent(apiKey)}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw apiError(`Gemini model discovery failed (HTTP ${response.status}). Check the API key and Generative Language API access.`,
        response.status === 401 || response.status === 403 ? response.status : response.status === 429 ? 429 : 502);
    }

    const available = new Map((data.models || [])
      .filter((model) => (model.supportedGenerationMethods || []).includes('generateContent'))
      .map((model) => [String(model.name || '').replace(/^models\//, ''), model]));
    const requestedIds = [...new Set([defaultModel, ...PREFERRED_MODELS.map((model) => model.id), ...explicitlyFree])];
    return requestedIds.filter((id) => available.has(id)).map((id) => {
      const model = available.get(id);
      const preferred = PREFERRED_MODELS.find((entry) => entry.id === id);
      const name = preferred?.name || model.displayName || id;
      return {
        id,
        name,
        provider: 'gemini',
        free: explicitlyFree.has(id),
        label: `${name} (Gemini · ${explicitlyFree.has(id) ? 'configured as free' : 'check quota/pricing'})`,
      };
    });
  }

  async function chat({ model, prompt }) {
    if (!configured) throw apiError('Gemini is not configured. Add GEMINI_API_KEY to server/.env.', 503);
    if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw apiError('Invalid Gemini model identifier.', 400);
    const response = await fetchImpl(`${API}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const status = response.status === 429 ? 429 : (response.status === 401 || response.status === 403 ? response.status : response.status === 404 ? 404 : response.status >= 500 ? 502 : 400);
      const detail = data?.error?.message;
      throw apiError(`Gemini request failed (HTTP ${response.status})${detail ? `: ${detail}` : '.'}`, status);
    }
    const output = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
    if (!output) throw apiError('Gemini returned no text. Try another model.');
    return output;
  }

  return { configured, fetchModels, chat };
}
