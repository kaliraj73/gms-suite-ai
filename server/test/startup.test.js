import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

function runNode(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('backend exits with a clear diagnostic when configured port is occupied', async () => {
  const occupied = createServer();
  await new Promise((resolve) => occupied.listen(0, '127.0.0.1', resolve));
  const port = occupied.address().port;
  try {
    const result = await runNode(['src/index.js'], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, PORT: String(port), OPENROUTER_API_KEY: '', GEMINI_API_KEY: '' },
    });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, new RegExp(`Port ${port} is already in use`));
    assert.doesNotMatch(result.stderr, /API_KEY=.*\S/);
  } finally {
    await new Promise((resolve, reject) => occupied.close((error) => error ? reject(error) : resolve()));
  }
});
