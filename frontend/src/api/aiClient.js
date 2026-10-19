async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
  } catch {
    throw new Error('Cannot reach the GMS AI server. Check that the backend is running.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (HTTP ${response.status}).`);
  return payload;
}
export const fetchModels = () => request('/api/ai/models');
export const fetchHealth = () => request('/api/ai/health');
export const sendPrompt = (body) => request('/api/ai', { method: 'POST', body: JSON.stringify(body) });