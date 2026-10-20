const apiBase = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
  } catch {
    throw new Error('Cannot reach the GMS AI server. Check the backend URL and confirm that the API is running.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (HTTP ${response.status}).`);
  return payload;
}
export const fetchModels = (options = {}) => request(`/api/ai/models${options.refresh ? '?refresh=1' : ''}`);
export const fetchHealth = () => request('/api/ai/health');
export const sendPrompt = (body) => request('/api/ai', { method: 'POST', body: JSON.stringify(body) });
