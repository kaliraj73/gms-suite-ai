import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';

async function withServer(deepAgentsService, run) {
  const aiService = { health: () => ({ status: 'ok', providers: { openrouter: true, gemini: true } }), listModels: async () => ({ models: [], providers: { openrouter: true, gemini: true }, warnings: [] }), generate: async () => ({ output: 'standard response' }) };
  const server = createServer(createApp({ aiService, deepAgentsService }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test('Deep Agents endpoint is disabled by default and does not call the agent', async () => {
  let called = false;
  await withServer({ enabled: false, generate: async () => { called = true; return { output: 'nope' }; } }, async (base) => {
    const health = await fetch(`${base}/api/ai/health`).then((r) => r.json());
    assert.equal(health.deepAgents.enabled, false);
    const res = await fetch(`${base}/api/ai/agent`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'Plan a data quality check' }) });
    assert.equal(res.status, 404);
    assert.match((await res.json()).error, /disabled/i);
  });
  assert.equal(called, false);
});

test('Deep Agents endpoint forwards validated prompt only when enabled', async () => {
  let received;
  await withServer({ enabled: true, generate: async (input) => { received = input; return { output: 'Plan: validate dates, then check missing values.', agent: 'langchain-deep-agents' }; } }, async (base) => {
    const res = await fetch(`${base}/api/ai/agent`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: ' Plan a data quality check ', model: 'gemini:gemini-2.5-flash', mode: 'gemini' }) });
    assert.equal(res.status, 200);
    assert.match((await res.json()).output, /validate dates/i);
  });
  assert.deepEqual(received, { prompt: 'Plan a data quality check', model: 'gemini:gemini-2.5-flash', mode: 'gemini' });
});

test('Deep Agents endpoint rejects blank prompts', async () => {
  await withServer({ enabled: true, generate: async () => ({ output: 'unexpected' }) }, async (base) => {
    const res = await fetch(`${base}/api/ai/agent`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: '   ' }) });
    assert.equal(res.status, 400);
  });
});
