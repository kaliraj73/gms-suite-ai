const API = 'https://openrouter.ai/api/v1';

function apiError(message, status = 502) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function decode(response, provider) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const status = response.status === 429 ? 429 : (response.status === 401 || response.status === 403 ? response.status : response.status >= 500 ? 502 : 400);
    // Do not include provider response bodies in logs; they may contain diagnostics not suitable for clients.
    throw apiError(`${provider} request failed (HTTP ${response.status}).`, status);
  }
  return data;
}

export function createOpenRouterProvider({ apiKey, env = process.env, fetchImpl = fetch, timeoutMs = 25000 }) {
  const configured = Boolean(apiKey);
  const headers = () => ({
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    ...(env.OPENROUTER_REFERER ? { 'HTTP-Referer': env.OPENROUTER_REFERER } : {}),
    ...(env.OPENROUTER_TITLE ? { 'X-Title': env.OPENROUTER_TITLE } : {}),
  });

  async function fetchModels() {
    if (!configured) return [];
    const response = await fetchImpl(`${API}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await decode(response, 'OpenRouter');
    return (Array.isArray(data.data) ? data.data : [])
      .filter((m) => m?.id && m?.pricing && Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0)
      .map((m) => ({
        id: m.id,
        name: m.name || m.id,
        provider: 'openrouter',
        free: true,
        label: `${m.name || m.id} (OpenRouter · $0 pricing reported)`,
      }));
  }

  async function chat({ model, prompt }) {
    if (!configured) throw apiError('OpenRouter is not configured. Add OPENROUTER_API_KEY to server/.env.', 503);
    const response = await fetchImpl(`${API}/chat/completions`, {
      method: 'POST',
      headers: headers(),
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.3 }),
    });
    const data = await decode(response, 'OpenRouter');
    const output = data?.choices?.[0]?.message?.content;
    if (typeof output !== 'string' || !output.trim()) throw apiError('OpenRouter returned no text. Try another model.');
    return output.trim();
  }

  return { configured, fetchModels, chat };
}
