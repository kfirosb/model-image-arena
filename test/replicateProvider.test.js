import test from 'node:test';
import assert from 'node:assert/strict';
import { makeReplicateProvider, __setFetch, __setSleep } from '../src/replicateProvider.js';

// Make backoff instant in tests so retry logic runs without real delays.
__setSleep(async () => {});

const provider = makeReplicateProvider({
  id: 'x',
  label: 'X',
  model: 'owner/name',
  cost: 0.5,
  input: { num_outputs: 1 },
});

test('hasKey reflects env var', () => {
  const prev = process.env.REPLICATE_API_TOKEN;
  process.env.REPLICATE_API_TOKEN = '';
  assert.equal(provider.hasKey(), false);
  process.env.REPLICATE_API_TOKEN = 'r8_test';
  assert.equal(provider.hasKey(), true);
  process.env.REPLICATE_API_TOKEN = prev;
});

test('generate hits the configured model, sends prompt + extra input, returns cost', async () => {
  process.env.REPLICATE_API_TOKEN = 'r8_test';
  __setFetch(async (url, opts) => {
    assert.match(url, /\/models\/owner\/name\/predictions$/);
    assert.equal(opts.headers.Prefer, 'wait');
    const body = JSON.parse(opts.body);
    assert.equal(body.input.prompt, 'a frog');
    assert.equal(body.input.num_outputs, 1); // extra input merged
    return { ok: true, json: async () => ({ status: 'succeeded', output: ['https://r/frog.png'] }) };
  });
  const out = await provider.generate('a frog');
  assert.equal(out.image, 'https://r/frog.png');
  assert.equal(out.cost, 0.5);
  assert.equal(typeof out.ms, 'number');
});

test('generate handles a single-string output (not an array)', async () => {
  process.env.REPLICATE_API_TOKEN = 'r8_test';
  __setFetch(async () => ({ ok: true, json: async () => ({ status: 'succeeded', output: 'https://r/single.png' }) }));
  const out = await provider.generate('a frog');
  assert.equal(out.image, 'https://r/single.png');
});

test('generate throws readable error on non-ok HTTP', async () => {
  process.env.REPLICATE_API_TOKEN = 'r8_test';
  __setFetch(async () => ({ ok: false, status: 422, text: async () => 'invalid input' }));
  await assert.rejects(() => provider.generate('a frog'), /422|invalid input/);
});

test('generate throws when prediction status is not succeeded (structured error stringified)', async () => {
  process.env.REPLICATE_API_TOKEN = 'r8_test';
  __setFetch(async () => ({ ok: true, json: async () => ({ status: 'failed', error: { code: 'nsfw' } }) }));
  await assert.rejects(
    () => provider.generate('a frog'),
    (err) => {
      assert.match(err.message, /nsfw/);
      assert.doesNotMatch(err.message, /\[object Object\]/);
      return true;
    },
  );
});

test('generate throws when output is empty', async () => {
  process.env.REPLICATE_API_TOKEN = 'r8_test';
  __setFetch(async () => ({ ok: true, json: async () => ({ status: 'succeeded', output: [] }) }));
  await assert.rejects(() => provider.generate('a frog'), /no image/i);
});

test('generate retries on 429 throttling and then succeeds', async () => {
  process.env.REPLICATE_API_TOKEN = 'r8_test';
  let calls = 0;
  __setFetch(async () => {
    calls += 1;
    if (calls < 3) {
      return { ok: false, status: 429, text: async () => JSON.stringify({ detail: 'throttled', retry_after: 0 }) };
    }
    return { ok: true, json: async () => ({ status: 'succeeded', output: ['https://r/after-retry.png'] }) };
  });
  const out = await provider.generate('a frog');
  assert.equal(out.image, 'https://r/after-retry.png');
  assert.equal(calls, 3); // two 429s, third succeeds
});

test('generate gives up after max attempts of persistent 429', async () => {
  process.env.REPLICATE_API_TOKEN = 'r8_test';
  let calls = 0;
  __setFetch(async () => {
    calls += 1;
    return { ok: false, status: 429, text: async () => JSON.stringify({ detail: 'throttled', retry_after: 0 }) };
  });
  await assert.rejects(() => provider.generate('a frog'), /Replicate 429/);
  assert.equal(calls, 4); // MAX_ATTEMPTS
});

test('generate does NOT retry on a non-429 error (e.g. 422)', async () => {
  process.env.REPLICATE_API_TOKEN = 'r8_test';
  let calls = 0;
  __setFetch(async () => {
    calls += 1;
    return { ok: false, status: 422, text: async () => 'invalid input' };
  });
  await assert.rejects(() => provider.generate('a frog'), /422/);
  assert.equal(calls, 1); // no retry on 422
});

// A fetch fake that records how many requests overlap in flight.
function concurrencyTrackingFetch() {
  const state = { active: 0, max: 0 };
  const fetch = async () => {
    state.active += 1;
    state.max = Math.max(state.max, state.active);
    await new Promise((r) => setTimeout(r, 10));
    state.active -= 1;
    return { ok: true, json: async () => ({ status: 'succeeded', output: ['https://r/x.png'] }) };
  };
  return { state, fetch };
}

test('by default the waiter runs Replicate requests one at a time', async () => {
  process.env.REPLICATE_API_TOKEN = 'r8_test';
  delete process.env.REPLICATE_CONCURRENCY;
  const { state, fetch } = concurrencyTrackingFetch();
  __setFetch(fetch);
  await Promise.all([provider.generate('a'), provider.generate('b'), provider.generate('c')]);
  assert.equal(state.max, 1); // never more than one in flight
});

test('REPLICATE_CONCURRENCY raises how many run in parallel', async () => {
  process.env.REPLICATE_API_TOKEN = 'r8_test';
  process.env.REPLICATE_CONCURRENCY = '3';
  const { state, fetch } = concurrencyTrackingFetch();
  __setFetch(fetch);
  await Promise.all([provider.generate('a'), provider.generate('b'), provider.generate('c')]);
  assert.equal(state.max, 3);
  delete process.env.REPLICATE_CONCURRENCY;
});
