import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateImage, __setFetch } from '../src/generateImage.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = join(__dirname, 'fixtures', 'genimage');

test('decodes a data-url image to a buffer with mime and cost', async () => {
  const out = await generateImage({ model: 'fake-image', prompt: 'x', providersDir: dir });
  assert.ok(Buffer.isBuffer(out.buffer));
  assert.ok(out.buffer.length > 0);
  assert.equal(out.mime, 'image/png');
  assert.equal(out.cost, 0.02);
  assert.equal(out.ms, 5);
});

test('downloads an https image via injected fetch', async () => {
  __setFetch(async (url) => {
    assert.equal(url, 'https://example/img.png');
    return { ok: true, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new TextEncoder().encode('JPG').buffer };
  });
  const out = await generateImage({ model: 'fake-http', prompt: 'x', providersDir: dir });
  assert.equal(out.mime, 'image/jpeg');
  assert.equal(out.buffer.toString(), 'JPG');
});

test('throws on unknown model, listing available image ids', async () => {
  await assert.rejects(
    () => generateImage({ model: 'nope', prompt: 'x', providersDir: dir }),
    (err) => { assert.match(err.message, /Unknown model "nope"/); assert.match(err.message, /Available:/); assert.match(err.message, /fake-image/); return true; },
  );
});

test('rejects a video model', async () => {
  await assert.rejects(() => generateImage({ model: 'fake-video', prompt: 'x', providersDir: dir }), /video model/);
});

test('errors when the model has no key', async () => {
  await assert.rejects(() => generateImage({ model: 'fake-nokey', prompt: 'x', providersDir: dir }), /No API key/);
});
