import test from 'node:test';
import assert from 'node:assert/strict';
import openai, { __setFetch } from '../providers/openai.js';

test('hasKey reflects env var', () => {
  const prev = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = '';
  assert.equal(openai.hasKey(), false);
  process.env.OPENAI_API_KEY = 'sk-test';
  assert.equal(openai.hasKey(), true);
  process.env.OPENAI_API_KEY = prev;
});

test('generate maps b64_json to a data URL', async () => {
  process.env.OPENAI_API_KEY = 'sk-test';
  __setFetch(async (url, opts) => {
    assert.match(url, /images\/generations/);
    const body = JSON.parse(opts.body);
    assert.equal(body.prompt, 'a frog');
    return {
      ok: true,
      json: async () => ({ data: [{ b64_json: 'QUJD' }] }),
    };
  });
  const out = await openai.generate('a frog');
  assert.equal(out.image, 'data:image/png;base64,QUJD');
  assert.equal(typeof out.ms, 'number');
  assert.ok(out.cost >= 0);
});

test('generate throws a readable error on API failure', async () => {
  process.env.OPENAI_API_KEY = 'sk-test';
  __setFetch(async () => ({
    ok: false, status: 400,
    text: async () => 'bad prompt',
  }));
  await assert.rejects(() => openai.generate('a frog'), /400|bad prompt/);
});
