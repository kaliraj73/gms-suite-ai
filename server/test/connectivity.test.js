import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';

test('API health and models are reachable on a server bound to all interfaces', async () => {
  const service = {
    health: () => ({ status: 'ok', providers: { openrouter: false, gemini: false } }),
    listModels: async () => ({ models: [], providers: { openrouter: false, gemini: false }, warnings: [] }),
    generate: async () => ({ output: 'ok' }),
  };
  const server = createServer(createApp({ aiService: service }));
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  try {
    const host = server.address().address === '0.0.0.0' ? '127.0.0.1' : server.address().address;
    const health = await fetch(`http://${host}:${server.address().port}/api/ai/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, 'ok');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
