import test from 'node:test';
import assert from 'node:assert/strict';
import replicate, { __setFetch } from '../providers/replicate.js';

test('hasKey reflects env var', () => {
  const prev = process.env.REPLICATE_API_TOKEN;
  process.env.REPLICATE_API_TOKEN = '';
  assert.equal(replicate.hasKey(), false);
  process.env.REPLICATE_API_TOKEN = 'r8_test';
  assert.equal(replicate.hasKey(), true);
  process.env.REPLICATE_API_TOKEN = prev;
});

test('generate returns first output url', async () => {
  process.env.REPLICATE_API_TOKEN = 'r8_test';
  __setFetch(async (url, opts) => {
    assert.match(url, /predictions/);
    assert.equal(opts.headers.Prefer, 'wait');
    const body = JSON.parse(opts.body);
    assert.equal(body.input.prompt, 'a frog');
    return {
      ok: true,
      json: async () => ({
        status: 'succeeded',
        output: ['https://replicate.delivery/frog.png'],
      }),
    };
  });
  const out = await replicate.generate('a frog');
  assert.equal(out.image, 'https://replicate.delivery/frog.png');
  assert.equal(typeof out.ms, 'number');
});

test('generate throws when prediction fails', async () => {
  process.env.REPLICATE_API_TOKEN = 'r8_test';
  __setFetch(async () => ({
    ok: true,
    json: async () => ({ status: 'failed', error: 'nsfw' }),
  }));
  await assert.rejects(() => replicate.generate('a frog'), /failed|nsfw/);
});
