import test from 'node:test';
import assert from 'node:assert/strict';
import { start } from '../server.js';

test('GET /api/health returns ok', async () => {
  const server = start(0); // port 0 = random free port
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  try {
    const res = await fetch(`http://localhost:${port}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { ok: true });
  } finally {
    server.close();
  }
});
