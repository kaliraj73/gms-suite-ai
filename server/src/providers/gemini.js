const API = 'https://generativelanguage.googleapis.com/v1beta';

function apiError(message, status = 502) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function providerError(response, data, provider) {
  const status = response.status === 429 ? 429
    : response.status === 401 || response.status === 403 ? response.status
    : response.status === 404 ? 404
    : response.status >= 500 ? 502 : 400;
  const message = status === 404
    ? `${provider} model was not found or is unavailable to this account (HTTP 404). Refresh the model list and select a currently available model.`
    : status === 400
      ? `${provider} rejected the request (HTTP 400). Check the selected model and prompt format.`
      : status === 403
        ? `${provider} access denied (HTTP 403). Check API restrictions, account eligibility, and quota access.`
        : status === 401
          ? `${provider} authentication failed (HTTP 401). Check the server-side API key configuration.`
          : status === 429
            ? `${provider} quota or rate limit reached (HTTP 429). Wait or check your account quota.`
            : status === 502
              ? `${provider} service error (HTTP ${response.status}). Try again later.`
              : `${provider} request failed (HTTP ${response.status}).`;
  // Provider payloads may include diagnostics; do not forward them to the browser or logs.
  void data;
  return apiError(message, status);
}

function safeFetchError(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return apiError('Gemini request timed out. Try a different currently available model or retry later.', 504);
  }
  return apiError('Could not connect to Google Gemini. Check Cloud Shell network access and try again.', 502);
}

export function createGeminiProvider({ apiKey, env = process.env, fetchImpl = fetch, timeoutMs = 25000 }) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  const configured = Boolean(key);
  const explicitlyFree = new Set((env.GEMINI_FREE_MODELS || '').split(',').map((v) => v.trim()).filter(Boolean));

  async function request(url, options) {
    try {
      const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw providerError(response, data, 'Gemini');
      return data;
    } catch (error) {
      if (Number.isInteger(error?.status)) throw error;
      throw safeFetchError(error);
    }
  }

  async function fetchModels() {
    if (!configured) return [];
    const url = new URL(`${API}/models`);
    url.searchParams.set('pageSize', '1000');
    const data = await request(url, { headers: { 'x-goog-api-key': key } });
    return (Array.isArray(data.models) ? data.models : [])
      .filter((model) => model?.name && Array.isArray(model.supportedGenerationMethods)
        && model.supportedGenerationMethods.includes('generateContent'))
      .map((model) => {
        const id = String(model.name).replace(/^models\//, '');
        return {
          id, name: model.displayName || id, provider: 'gemini',
          free: explicitlyFree.has(id),
          label: `${model.displayName || id} (Gemini · ${explicitlyFree.has(id) ? 'configured as free' : 'check quota/pricing'})`,
        };
      });
  }

  async function chat({ model, prompt }) {
    if (!configured) throw apiError('Gemini is not configured. Add GEMINI_API_KEY to server/.env.', 503);
    if (typeof model !== 'string' || !/^[a-zA-Z0-9._-]+$/.test(model)) {
      throw apiError('Invalid Gemini model identifier. Refresh the model list and select a listed model.', 400);
    }
    const data = await request(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    const output = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
    if (!output) throw apiError('Gemini returned no text. Try another available model.', 502);
    return output;
  }

  return { configured, fetchModels, chat };
}
