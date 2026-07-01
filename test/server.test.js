process.env.OPENAI_API_KEY = '';
process.env.REPLICATE_API_TOKEN = '';

import test from 'node:test';
import assert from 'node:assert/strict';
import { start } from '../server.js';

test('GET /api/providers returns 200 with providers array', async () => {
  const server = start(0);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  try {
    const res = await fetch(`http://localhost:${port}/api/providers`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.providers));
    assert.ok(body.providers.length > 0);
    for (const p of body.providers) {
      assert.equal(typeof p.id, 'string');
      assert.equal(typeof p.label, 'string');
      assert.ok(p.status === 'ready' || p.status === 'no_key');
      assert.equal(p.status, 'no_key');
    }
  } finally {
    server.close();
  }
});

test('POST /api/generate with empty prompt returns 400', async () => {
  const server = start(0);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  try {
    const res = await fetch(`http://localhost:${port}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(typeof body.error, 'string');
  } finally {
    server.close();
  }
});

test('POST /api/generate with missing prompt returns 400', async () => {
  const server = start(0);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  try {
    const res = await fetch(`http://localhost:${port}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(typeof body.error, 'string');
  } finally {
    server.close();
  }
});

test('POST /api/generate with a real prompt returns 200 and no_key results (no keys set, no network calls)', async () => {
  const server = start(0);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  try {
    const res = await fetch(`http://localhost:${port}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'a frog' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.prompt, 'a frog');
    assert.ok(Array.isArray(body.results));
    assert.ok(body.results.length > 0);
    for (const r of body.results) {
      assert.equal(r.status, 'no_key');
    }
  } finally {
    server.close();
  }
});
