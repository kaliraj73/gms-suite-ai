const API = 'https://generativelanguage.googleapis.com/v1beta';

function apiError(message, status = 502) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function createGeminiProvider({ apiKey, env = process.env, fetchImpl = fetch, timeoutMs = 25000 }) {
  const configured = Boolean(apiKey);
  const defaultModel = env.GEMINI_MODEL || 'gemini-3.8-flash';
  const explicitlyFree = new Set((env.GEMINI_FREE_MODELS || '').split(',').map((v) => v.trim()).filter(Boolean));

  async function fetchModels() {
    if (!configured) return [];
    const ids = [...new Set([defaultModel, ...explicitlyFree])];
    return ids.map((id) => ({
      id,
      name: id,
      provider: 'gemini',
      free: explicitlyFree.has(id),
      label: `${id} (Gemini · ${explicitlyFree.has(id) ? 'configured as free' : 'check quota/pricing'})`,
    }));
  }

  async function chat({ model, prompt }) {
    if (!configured) throw apiError('Gemini is not configured. Add GEMINI_API_KEY to server/.env.', 503);
    if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw apiError('Invalid Gemini model identifier.', 400);
    const response = await fetchImpl(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const status = response.status === 429 ? 429 : (response.status === 401 || response.status === 403 ? response.status : response.status >= 500 ? 502 : 400);
      throw apiError(`Gemini request failed (HTTP ${response.status}).`, status);
    }
    const output = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
    if (!output) throw apiError('Gemini returned no text. Try another model.');
    return output;
  }

  return { configured, fetchModels, chat };
}
