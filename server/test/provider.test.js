import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenRouterProvider } from '../src/providers/openrouter.js';
import { createGeminiProvider } from '../src/providers/gemini.js';
import { createAiService } from '../src/providers/provider-factory.js';

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('OpenRouter sends Bearer auth and maps 401 without leaking response body or key', async () => {
  const secret = 'test-openrouter-secret-never-print';
  let observed;
  const provider = createOpenRouterProvider({
    apiKey: secret,
    fetchImpl: async (_url, options) => { observed = options; return response({ secret: 'provider diagnostic' }, 401); },
  });
  await assert.rejects(provider.chat({ model: 'openrouter/free', prompt: 'hello' }), (error) => {
    assert.equal(error.status, 401);
    assert.doesNotMatch(error.message, new RegExp(secret));
    assert.doesNotMatch(error.message, /provider diagnostic/);
    return true;
  });
  assert.equal(observed.headers.Authorization, `Bearer ${secret}`);
});

test('Gemini discovers only live models supporting generateContent', async () => {
  const provider = createGeminiProvider({
    apiKey: 'test-key',
    env: { GEMINI_MODEL: 'old-model', GEMINI_FREE_MODELS: 'gemini-live' },
    fetchImpl: async (url, options) => {
      assert.match(String(url), /\/models/);
      assert.equal(options.headers['x-goog-api-key'], 'test-key');
      return response({ models: [
        { name: 'models/gemini-live', displayName: 'Gemini Live', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/embedding-only', supportedGenerationMethods: ['embedContent'] },
      ] });
    },
  });
  const models = await provider.fetchModels();
  assert.deepEqual(models.map((m) => m.id), ['gemini-live']);
  assert.equal(models[0].free, true);
});

test('Gemini discovery reports auth errors without exposing provider response bodies', async () => {
  const provider = createGeminiProvider({
    apiKey: 'test-key',
    fetchImpl: async () => response({ error: { message: 'private key diagnostic' } }, 401),
  });
  await assert.rejects(provider.fetchModels(), (error) => {
    assert.equal(error.status, 401);
    assert.doesNotMatch(error.message, /private key diagnostic/);
    return true;
  });
});

test('model refresh bypasses caches for both providers and reports discovery warnings safely', async () => {
  let geminiCalls = 0;
  let openrouterCalls = 0;
  const service = createAiService({
    env: { OPENROUTER_API_KEY: 'or-test', GEMINI_API_KEY: 'gm-test', MODEL_CACHE_TTL_MS: '60000' },
    fetchImpl: async (url) => {
      if (String(url).includes('openrouter.ai')) {
        openrouterCalls += 1;
        return response({ data: [{ id: 'free-model', pricing: { prompt: '0', completion: '0' } }] });
      }
      geminiCalls += 1;
      return response({ models: [{ name: 'models/gemini-live', supportedGenerationMethods: ['generateContent'] }] });
    },
  });
  const first = await service.listModels();
  assert.equal(first.models.some((m) => m.id === 'gemini:gemini-live'), true);
  await service.listModels();
  assert.equal(geminiCalls, 1);
  await service.listModels({ refresh: true });
  assert.equal(geminiCalls, 2);
  assert.equal(openrouterCalls, 2);
});
