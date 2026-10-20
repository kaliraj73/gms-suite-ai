const API = 'https://openrouter.ai/api/v1';

function apiError(message, status = 502) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function decode(response, provider) {
  await response.json().catch(() => ({}));
  if (!response.ok) {
    const status = response.status === 429 ? 429
      : response.status === 401 || response.status === 403 ? response.status
      : response.status >= 500 ? 502 : response.status === 404 ? 404 : 400;
    throw apiError(`${provider} request failed (HTTP ${response.status}).`, status);
  }
  // Read the body only once; the provider response is parsed by the caller on success.
  return response;
}

function safeFetchError(error, provider) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return apiError(`${provider} request timed out. Try again or choose another model.`, 504);
  }
  return apiError(`Could not connect to ${provider}. Check Cloud Shell network access and try again.`, 502);
}

export function createOpenRouterProvider({ apiKey, env = process.env, fetchImpl = fetch, timeoutMs = 25000 }) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  const configured = Boolean(key);
  const headers = () => ({
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...(env.OPENROUTER_REFERER ? { 'HTTP-Referer': env.OPENROUTER_REFERER } : {}),
    ...(env.OPENROUTER_TITLE ? { 'X-Title': env.OPENROUTER_TITLE } : {}),
  });

  async function request(url, options, provider) {
    try {
      const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const status = response.status === 429 ? 429
          : response.status === 401 || response.status === 403 ? response.status
          : response.status >= 500 ? 502 : response.status === 404 ? 404 : 400;
        throw apiError(`${provider} request failed (HTTP ${response.status}).`, status);
      }
      return data;
    } catch (error) {
      if (Number.isInteger(error?.status)) throw error;
      throw safeFetchError(error, provider);
    }
  }

  async function fetchModels() {
    if (!configured) return [];
    const data = await request(`${API}/models`, { headers: { Authorization: `Bearer ${key}` } }, 'OpenRouter');
    return (Array.isArray(data.data) ? data.data : [])
      .filter((m) => m?.id && m?.pricing && Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0)
      .map((m) => ({
        id: m.id, name: m.name || m.id, provider: 'openrouter', free: true,
        label: `${m.name || m.id} (OpenRouter · $0 pricing reported)`,
      }));
  }

  async function chat({ model, prompt }) {
    if (!configured) throw apiError('OpenRouter is not configured. Add OPENROUTER_API_KEY to server/.env.', 503);
    const data = await request(`${API}/chat/completions`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.3 }),
    }, 'OpenRouter');
    const output = data?.choices?.[0]?.message?.content;
    if (typeof output !== 'string' || !output.trim()) throw apiError('OpenRouter returned no text. Try another model.');
    return output.trim();
  }

  return { configured, fetchModels, chat };
}
