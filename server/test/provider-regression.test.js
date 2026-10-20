import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiProvider } from '../src/providers/gemini.js';
import { createOpenRouterProvider } from '../src/providers/openrouter.js';
import { createAiService } from '../src/providers/provider-factory.js';

const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300, status, json: async () => body,
});

test('Gemini sends live catalogue model ID to the supported generateContent endpoint', async () => {
  let seenUrl = '';
  const provider = createGeminiProvider({
    apiKey: 'test-key',
    fetchImpl: async (url) => {
      seenUrl = String(url);
      return response({ candidates: [{ content: { parts: [{ text: 'hello' }] } }] });
    },
  });
  assert.equal(await provider.chat({ model: 'gemini-live-001', prompt: 'hi' }), 'hello');
  assert.match(seenUrl, /\/v1beta\/models\/gemini-live-001:generateContent$/);
});

test('Gemini maps deprecated model 404 to actionable error and does not leak provider payload', async () => {
  const provider = createGeminiProvider({
    apiKey: 'test-key',
    fetchImpl: async () => response({ error: { message: 'private diagnostic' } }, 404),
  });
  await assert.rejects(provider.chat({ model: 'retired-model', prompt: 'hi' }), (error) => {
    assert.equal(error.status, 404);
    assert.match(error.message, /unavailable to this account/);
    assert.doesNotMatch(error.message, /private diagnostic/);
    return true;
  });
});

test('Gemini network timeout has bounded, useful status', async () => {
  const provider = createGeminiProvider({
    apiKey: 'test-key',
    fetchImpl: async () => { const e = new Error('deadline'); e.name = 'TimeoutError'; throw e; },
  });
  await assert.rejects(provider.chat({ model: 'gemini-live-001', prompt: 'hi' }), (error) => {
    assert.equal(error.status, 504);
    assert.match(error.message, /timed out/);
    return true;
  });
});

test('OpenRouter successful chat uses canonical API endpoint and trimmed server key', async () => {
  let seenUrl = '';
  let seenOptions;
  const provider = createOpenRouterProvider({
    apiKey: '  test-key  ',
    fetchImpl: async (url, options) => {
      seenUrl = String(url); seenOptions = options;
      return response({ choices: [{ message: { content: 'answer' } }] });
    },
  });
  assert.equal(await provider.chat({ model: 'provider/model', prompt: 'hi' }), 'answer');
  assert.equal(seenUrl, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(seenOptions.headers.Authorization, 'Bearer test-key');
  assert.deepEqual(JSON.parse(seenOptions.body), {
    model: 'provider/model', messages: [{ role: 'user', content: 'hi' }], temperature: 0.3,
  });
});

test('OpenRouter 401 stops same-provider fallback retries immediately', async () => {
  let calls = 0;
  const service = createAiService({
    env: { OPENROUTER_API_KEY: 'test-key', MODEL_CACHE_TTL_MS: '60000' },
    fetchImpl: async (url) => {
      calls += 1;
      if (String(url).endsWith('/models')) {
        return response({ data: [
          { id: 'free-one', pricing: { prompt: '0', completion: '0' } },
          { id: 'free-two', pricing: { prompt: '0', completion: '0' } },
        ] });
      }
      return response({ error: { message: 'private unauthorized detail' } }, 401);
    },
  });
  await assert.rejects(service.generate({ model: 'openrouter:free-one', prompt: 'hi' }), (error) => {
    assert.equal(error.status, 401);
    assert.match(error.message, /authentication failed/);
    assert.doesNotMatch(error.message, /private unauthorized detail|test-key/);
    return true;
  });
  assert.equal(calls, 2, 'one catalogue request and one chat request; no repeated model retries');
});

test('OpenRouter 401 primary failure tries configured Gemini in both mode only', async () => {
  const calls = [];
  const service = createAiService({
    env: { OPENROUTER_API_KEY: 'test-key', GEMINI_API_KEY: 'another-test-key', MODEL_CACHE_TTL_MS: '60000' },
    fetchImpl: async (url) => {
      const value = String(url);
      calls.push(value);
      if (value.endsWith('/models')) return response({ data: [{ id: 'free-one', pricing: { prompt: '0', completion: '0' } }] });
      if (value.endsWith('/models?pageSize=1000')) return response({ models: [{ name: 'models/gemini-live-001', supportedGenerationMethods: ['generateContent'] }] });
      if (value.endsWith('/chat/completions')) return response({ error: { message: 'invalid credential' } }, 401);
      if (value.endsWith('/models/gemini-live-001:generateContent')) return response({ candidates: [{ content: { parts: [{ text: 'Gemini fallback answer' }] } }] });
      return response({}, 404);
    },
  });
  const result = await service.generate({ model: 'openrouter:free-one', mode: 'both', prompt: 'hi' });
  assert.equal(result.output, 'Gemini fallback answer');
  assert.equal(result.provider, 'gemini');
  assert.equal(result.fallbackUsed, true);
  assert.equal(calls.filter((url) => url.endsWith('/chat/completions')).length, 1, 'do not retry OpenRouter models after 401');
});

test('OpenRouter missing and whitespace-only API keys are not configured', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return response({}); };
  assert.equal(createOpenRouterProvider({ apiKey: '', fetchImpl }).configured, false);
  assert.equal(createOpenRouterProvider({ apiKey: '  \t ', fetchImpl }).configured, false);
  assert.deepEqual(await createOpenRouterProvider({ apiKey: '  ', fetchImpl }).fetchModels(), []);
  assert.equal(calls, 0);
});

test('OpenRouter model discovery uses the canonical URL and Bearer header', async () => {
  let seen;
  const provider = createOpenRouterProvider({
    apiKey: ' test-key ',
    fetchImpl: async (url, options) => { seen = { url: String(url), auth: options.headers.Authorization }; return response({ data: [] }); },
  });
  await provider.fetchModels();
  assert.equal(seen.url, 'https://openrouter.ai/api/v1/models');
  assert.equal(seen.auth, 'Bearer test-key');
});

test('OpenRouter maps common provider statuses without exposing payloads', async () => {
  for (const [status, matcher] of [
    [401, /authentication failed/], [403, /access denied/], [404, /not found/],
    [429, /rate limit or quota/], [503, /service error/],
  ]) {
    const provider = createOpenRouterProvider({
      apiKey: 'secret-test-value',
      fetchImpl: async () => response({ error: { message: 'sensitive raw provider payload' } }, status),
    });
    await assert.rejects(provider.chat({ model: 'provider/model', prompt: 'hi' }), (error) => {
      assert.match(error.message, matcher);
      assert.doesNotMatch(error.message, /sensitive raw provider payload|secret-test-value/);
      assert.ok(Number.isInteger(error.status));
      return true;
    });
  }
});

test('Gemini rejects model absent from live catalogue without issuing a generation request', async () => {
  let generationCalls = 0;
  const service = createAiService({
    env: { GEMINI_API_KEY: 'test-key', MODEL_CACHE_TTL_MS: '60000' },
    fetchImpl: async (url) => {
      if (String(url).endsWith('/models?pageSize=1000')) {
        return response({ models: [{ name: 'models/current-model', supportedGenerationMethods: ['generateContent'] }] });
      }
      generationCalls += 1;
      return response({ candidates: [{ content: { parts: [{ text: 'should not run' }] } }] });
    },
  });
  await assert.rejects(service.generate({ model: 'gemini:gemini-2.5-flash', mode: 'gemini', prompt: 'hi' }), (error) => {
    assert.equal(error.status, 404);
    assert.match(error.message, /not in the current account catalogue/);
    return true;
  });
  assert.equal(generationCalls, 0);
});
