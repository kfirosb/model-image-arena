import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAll, listProviders } from '../src/generate.js';

const good = {
  id: 'good', label: 'Good', hasKey: () => true,
  generate: async () => ({ image: 'data:x', ms: 3, cost: 0.01 }),
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

test('listProviders reports ready/no_key without calling generate', () => {
  const list = listProviders([good, nokey]);
  assert.deepEqual(list, [
    { id: 'good', label: 'Good', status: 'ready' },
    { id: 'nokey', label: 'NoKey', status: 'no_key' },
  ]);
});
