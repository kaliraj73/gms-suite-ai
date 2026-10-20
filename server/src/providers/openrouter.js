const API = 'https://openrouter.ai/api/v1';

function apiError(message, status = 502) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function authError(provider, status) {
  if (status === 401) {
    return apiError(`${provider} authentication failed (HTTP 401). Verify that the server loaded an active, non-revoked API key from its backend environment, then restart the backend.`, 401);
  }
  if (status === 403) {
    return apiError(`${provider} access denied (HTTP 403). Check account eligibility, API restrictions, and quota access.`, 403);
  }
  if (status === 404) {
    return apiError(`${provider} model or endpoint was not found (HTTP 404). Refresh the model list and choose an available model.`, 404);
  }
  if (status === 429) {
    return apiError(`${provider} rate limit or quota reached (HTTP 429). Check account quota and retry later.`, 429);
  }
  if (status >= 500) {
    return apiError(`${provider} service error (HTTP ${status}). Try again later.`, 502);
  }
  return apiError(`${provider} request failed (HTTP ${status}). Check the selected model and request.`, 400);
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
      if (!response.ok) throw authError(provider, response.status);
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
