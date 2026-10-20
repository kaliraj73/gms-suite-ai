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

test('OpenRouter 401 stops fallback retries immediately', async () => {
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
      return response({ error: { message: 'unauthorized' } }, 401);
    },
  });
  await assert.rejects(service.generate({ model: 'openrouter:free-one', prompt: 'hi' }), (error) => {
    assert.equal(error.status, 401);
    assert.match(error.message, /authentication failed/);
    return true;
  });
  assert.equal(calls, 2, 'one catalogue request and one chat request; no repeated model retries');
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
