import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSoraProvider, __setFetch, __setSleep } from '../src/soraProvider.js';

__setSleep(async () => {});

const provider = makeSoraProvider({ id: 'sora-2', label: 'Sora-2', model: 'sora-2', cost: 1.0, pollMs: 0 });

test('declares video kind and hasKey reflects OPENAI_API_KEY', () => {
  assert.equal(provider.kind, 'video');
  const prev = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = '';
  assert.equal(provider.hasKey(), false);
  process.env.OPENAI_API_KEY = 'sk-test';
  assert.equal(provider.hasKey(), true);
  process.env.OPENAI_API_KEY = prev;
});

test('creates a video job, polls until completed, returns a data URL', async () => {
  process.env.OPENAI_API_KEY = 'sk-test';
  let poll = 0;
  __setFetch(async (url, opts) => {
    if (opts && opts.method === 'POST') {
      assert.match(url, /\/v1\/videos$/);
      const body = JSON.parse(opts.body);
      assert.equal(body.model, 'sora-2');
      assert.equal(body.prompt, 'a frog');
      return { ok: true, json: async () => ({ id: 'vid_1', status: 'queued' }) };
    }
    if (/\/content$/.test(url)) {
      return { ok: true, arrayBuffer: async () => new TextEncoder().encode('MP4DATA').buffer };
    }
    poll += 1;
    return { ok: true, json: async () => ({ id: 'vid_1', status: poll < 2 ? 'in_progress' : 'completed' }) };
  });
  const out = await provider.generate('a frog');
  assert.equal(out.type, 'video');
  assert.match(out.video, /^data:video\/mp4;base64,/);
  assert.equal(out.cost, 1.0);
});

test('throws when the job fails', async () => {
  process.env.OPENAI_API_KEY = 'sk-test';
  __setFetch(async (url, opts) => {
    if (opts && opts.method === 'POST') return { ok: true, json: async () => ({ id: 'v', status: 'queued' }) };
    return { ok: true, json: async () => ({ id: 'v', status: 'failed', error: { message: 'blocked' } }) };
  });
  await assert.rejects(() => provider.generate('a frog'), /failed|blocked/);
});
