import test from 'node:test';
import assert from 'node:assert/strict';
import { runOne } from '../src/runProvider.js';

const make = (over) => ({
  id: 'p', label: 'P',
  hasKey: () => true,
  generate: async () => ({ image: 'data:x', ms: 1, cost: 0 }),
  ...over,
});

test('no key -> no_key status, generate not called', async () => {
  let called = false;
  const p = make({ hasKey: () => false, generate: async () => { called = true; } });
  const r = await runOne(p, 'frog');
  assert.equal(r.status, 'no_key');
  assert.equal(called, false);
});

test('success -> done with image/ms/cost', async () => {
  const r = await runOne(make(), 'frog');
  assert.equal(r.status, 'done');
  assert.equal(r.image, 'data:x');
  assert.equal(r.id, 'p');
});

test('thrown error -> error status', async () => {
  const p = make({ generate: async () => { throw new Error('boom'); } });
  const r = await runOne(p, 'frog');
  assert.equal(r.status, 'error');
  assert.match(r.error, /boom/);
});

test('timeout -> error status', async () => {
  const p = make({ generate: () => new Promise(() => {}) }); // never resolves
  const r = await runOne(p, 'frog', 20);
  assert.equal(r.status, 'error');
  assert.match(r.error, /timed out/i);
});

test('hasKey throws -> resolves with error status, never rejects', async () => {
  const p = make({ hasKey: () => { throw new Error('key check failed'); } });
  const r = await runOne(p, 'frog');
  assert.equal(r.status, 'error');
  assert.match(r.error, /key check failed/);
});
