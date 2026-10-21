const enabled = (value) => String(value || 'false').trim().toLowerCase() === 'true';

export function createDeepAgentsClient({ env = process.env, fetchImpl = fetch } = {}) {
  const isEnabled = enabled(env.ENABLE_DEEP_AGENTS);
  const baseUrl = (env.DEEP_AGENTS_URL || 'http://127.0.0.1:8010').replace(/\/+$/, '');
  const token = String(env.DEEP_AGENTS_SHARED_TOKEN || '').trim();
  const timeoutMs = Math.max(1000, Number.parseInt(env.DEEP_AGENTS_TIMEOUT_MS || '50000', 10));

  async function generate({ prompt, model = '', mode = 'openrouter' }) {
    if (!isEnabled) {
      const error = new Error('Deep Agents is disabled. Set ENABLE_DEEP_AGENTS=true to enable it.');
      error.status = 404;
      throw error;
    }
    if (!token) {
      const error = new Error('Deep Agents is enabled but its service token is not configured.');
      error.status = 503;
      throw error;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}/agent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-gms-agent-token': token },
        body: JSON.stringify({ prompt, model, mode }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const status = [400, 401, 403, 404, 429, 503].includes(response.status) ? response.status : 502;
        const error = new Error(typeof payload.detail === 'string' ? payload.detail : 'Deep Agents service request failed.');
        error.status = status;
        throw error;
      }
      if (typeof payload.output !== 'string' || !payload.output.trim()) {
        const error = new Error('Deep Agents returned an invalid response.');
        error.status = 502;
        throw error;
      }
      return payload;
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error('Deep Agents request timed out. Try again or choose a standard model.');
        timeoutError.status = 504;
        throw timeoutError;
      }
      if (Number.isInteger(error?.status)) throw error;
      const connectionError = new Error('Cannot reach the optional Deep Agents service. Check that it is running.');
      connectionError.status = 503;
      throw connectionError;
    } finally {
      clearTimeout(timeout);
    }
  }

  return { enabled: isEnabled, generate };
}
