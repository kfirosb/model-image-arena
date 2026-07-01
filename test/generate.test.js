import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAll, listProviders } from '../src/generate.js';

const good = {
  id: 'good', label: 'Good', kind: 'image', cost: 0.01, hasKey: () => true,
  generate: async () => ({ image: 'data:x', ms: 3, cost: 0.01 }),
};
const vid = {
  id: 'vid', label: 'Vid', kind: 'video', cost: 0.3, hasKey: () => true,
  generate: async () => ({ video: 'https://x/c.mp4', type: 'video', ms: 5, cost: 0.3 }),
};
const bad = {
  id: 'bad', label: 'Bad', hasKey: () => true,
  generate: async () => { throw new Error('nope'); },
};
const nokey = {
  id: 'nokey', label: 'NoKey', hasKey: () => false,
  generate: async () => ({ image: 'x' }),
};

test('generateAll runs all and one failure does not break others', async () => {
  const results = await generateAll([good, bad, nokey], 'frog');
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  assert.equal(byId.good.status, 'done');
  assert.equal(byId.bad.status, 'error');
  assert.equal(byId.nokey.status, 'no_key');
});

test('generateAll with ids runs only the selected providers', async () => {
  const results = await generateAll([good, vid, bad], 'frog', ['vid']);
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'vid');
  assert.equal(results[0].type, 'video');
});

test('generateAll ignores an empty ids array (runs all)', async () => {
  const results = await generateAll([good, vid], 'frog', []);
  assert.equal(results.length, 2);
});

test('listProviders reports kind, cost, status without calling generate', () => {
  const list = listProviders([good, vid, nokey]);
  assert.deepEqual(list, [
    { id: 'good', label: 'Good', kind: 'image', cost: 0.01, status: 'ready' },
    { id: 'vid', label: 'Vid', kind: 'video', cost: 0.3, status: 'ready' },
    { id: 'nokey', label: 'NoKey', kind: 'image', cost: 0, status: 'no_key' },
  ]);
});
