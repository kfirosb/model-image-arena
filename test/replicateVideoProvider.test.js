import test from 'node:test';
import assert from 'node:assert/strict';
import { makeReplicateVideoProvider, __setFetch, __setSleep } from '../src/replicateVideoProvider.js';

__setSleep(async () => {}); // no real polling delay

const provider = makeReplicateVideoProvider({
  id: 'vx', label: 'VX', model: 'owner/vid', cost: 0.3, pollMs: 0,
});

test('provider declares video kind, cost, and a long timeout', () => {
  assert.equal(provider.kind, 'video');
  assert.equal(provider.cost, 0.3);
  assert.ok(provider.timeoutMs >= 120000);
});

test('creates a prediction then polls until succeeded and returns the video url', async () => {
  process.env.REPLICATE_API_TOKEN = 'r8_test';
  let poll = 0;
  __setFetch(async (url, opts) => {
    if (opts && opts.method === 'POST') {
      assert.match(url, /\/models\/owner\/vid\/predictions$/);
      const body = JSON.parse(opts.body);
      assert.equal(body.input.prompt, 'a frog');
      return { ok: true, json: async () => ({ id: 'p1', status: 'starting', urls: { get: 'https://api/get/p1' } }) };
    }
    // GET poll
    poll += 1;
    const status = poll < 2 ? 'processing' : 'succeeded';
    return { ok: true, json: async () => ({ status, output: status === 'succeeded' ? 'https://r/clip.mp4' : null }) };
  });
  const out = await provider.generate('a frog');
  assert.equal(out.type, 'video');
  assert.equal(out.video, 'https://r/clip.mp4');
  assert.equal(out.cost, 0.3);
});

test('throws when the prediction fails', async () => {
  process.env.REPLICATE_API_TOKEN = 'r8_test';
  __setFetch(async (url, opts) => {
    if (opts && opts.method === 'POST') return { ok: true, json: async () => ({ id: 'p', status: 'starting', urls: { get: 'g' } }) };
    return { ok: true, json: async () => ({ status: 'failed', error: 'nsfw' }) };
  });
  await assert.rejects(() => provider.generate('a frog'), /failed|nsfw/);
});

test('throws timed out when polling never completes before the deadline', async () => {
  process.env.REPLICATE_API_TOKEN = 'r8_test';
  const p = makeReplicateVideoProvider({ id: 'v2', label: 'V2', model: 'o/m', cost: 0.1, timeoutMs: 5, pollMs: 0 });
  __setFetch(async (url, opts) => {
    if (opts && opts.method === 'POST') return { ok: true, json: async () => ({ id: 'p', status: 'starting', urls: { get: 'g' } }) };
    return { ok: true, json: async () => ({ status: 'processing', output: null }) };
  });
  await assert.rejects(() => p.generate('a frog'), /timed out/i);
});
