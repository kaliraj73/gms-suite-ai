import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';

async function withServer(aiService, run) {
  const server = createServer(createApp({ aiService }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}
function fakeService() {
  return {
    health: () => ({ status: 'ok', providers: { openrouter: true, gemini: false } }),
    listModels: async () => ({ models: [{ id: 'openrouter:openrouter/free', free: true }], providers: { openrouter: true, gemini: false }, warnings: [] }),
    generate: async ({ model, prompt }) => ({ output: `Echo: ${prompt}`, provider: 'openrouter', model: model || 'openrouter:openrouter/free', fallbackUsed: false }),
  };
}

test('health returns provider status without secrets', async () => {
  await withServer(fakeService(), async (base) => {
    const res = await fetch(`${base}/api/ai/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok', providers: { openrouter: true, gemini: false }, deepAgents: { enabled: false } });
  });
});
test('models endpoint returns model list', async () => {
  await withServer(fakeService(), async (base) => {
    const res = await fetch(`${base}/api/ai/models`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).models[0].id, 'openrouter:openrouter/free');
  });
});
test('AI endpoint returns generated response for valid prompt', async () => {
  await withServer(fakeService(), async (base) => {
    const res = await fetch(`${base}/api/ai`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'openrouter:openrouter/free', prompt: 'hello' }) });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).output, 'Echo: hello');
  });
});
test('AI endpoint rejects blank prompt', async () => {
  await withServer(fakeService(), async (base) => {
    const res = await fetch(`${base}/api/ai`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: '   ' }) });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /prompt/i);
  });
});
