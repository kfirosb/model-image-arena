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

test('passes through video/type from a video provider result', async () => {
  const p = {
    id: 'v', label: 'V', hasKey: () => true,
    generate: async () => ({ video: 'https://x/clip.mp4', type: 'video', ms: 9, cost: 0.3 }),
  };
  const r = await runOne(p, 'frog');
  assert.equal(r.status, 'done');
  assert.equal(r.type, 'video');
  assert.equal(r.video, 'https://x/clip.mp4');
  assert.equal(r.cost, 0.3);
});

test('image result still reports type image and null video', async () => {
  const p = {
    id: 'i', label: 'I', hasKey: () => true,
    generate: async () => ({ image: 'data:x', ms: 1, cost: 0 }),
  };
  const r = await runOne(p, 'frog');
  assert.equal(r.type, 'image');
  assert.equal(r.image, 'data:x');
  assert.equal(r.video, null);
});

test('honors a provider-declared timeoutMs', async () => {
  const p = {
    id: 't', label: 'T', hasKey: () => true, timeoutMs: 15,
    generate: () => new Promise(() => {}), // never resolves
  };
  const r = await runOne(p, 'frog');
  assert.equal(r.status, 'error');
  assert.match(r.error, /timed out/i);
});
