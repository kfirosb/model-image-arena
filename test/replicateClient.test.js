import test from 'node:test';
import assert from 'node:assert/strict';
import { postWithRetry, getJson, withSlot, replicateHeaders, __setFetch, __setSleep } from '../src/replicateClient.js';

__setSleep(async () => {});

test('replicateHeaders includes auth and merges extra', () => {
  process.env.REPLICATE_API_TOKEN = 'r8_test';
  const h = replicateHeaders({ Prefer: 'wait' });
  assert.equal(h.Authorization, 'Bearer r8_test');
  assert.equal(h['Content-Type'], 'application/json');
  assert.equal(h.Prefer, 'wait');
});

test('postWithRetry retries on 429 then returns ok response', async () => {
  let calls = 0;
  __setFetch(async () => {
    calls += 1;
    if (calls < 2) return { ok: false, status: 429, text: async () => JSON.stringify({ retry_after: 0 }) };
    return { ok: true, json: async () => ({ ok: 1 }) };
  });
  const res = await postWithRetry('u', {});
  assert.equal((await res.json()).ok, 1);
  assert.equal(calls, 2);
});

test('postWithRetry throws on non-429 error', async () => {
  __setFetch(async () => ({ ok: false, status: 422, text: async () => 'bad' }));
  await assert.rejects(() => postWithRetry('u', {}), /422/);
});

test('getJson returns parsed body and throws on non-ok', async () => {
  __setFetch(async () => ({ ok: true, json: async () => ({ status: 'processing' }) }));
  assert.equal((await getJson('u')).status, 'processing');
  __setFetch(async () => ({ ok: false, status: 500, text: async () => 'boom' }));
  await assert.rejects(() => getJson('u'), /500|boom/);
});

test('withSlot serializes to one at a time by default', async () => {
  process.env.REPLICATE_API_TOKEN = 'r8_test';
  delete process.env.REPLICATE_CONCURRENCY;
  let active = 0, max = 0;
  const job = () => withSlot(async () => {
    active += 1; max = Math.max(max, active);
    await new Promise((r) => setTimeout(r, 10));
    active -= 1;
  });
  await Promise.all([job(), job(), job()]);
  assert.equal(max, 1);
});
