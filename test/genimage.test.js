import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { main, resolveModel } from '../bin/genimage.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = join(__dirname, 'fixtures', 'genimage');

test('generates, resizes to exact size, writes the file, and prints JSON', async () => {
  const out = join(tmpdir(), `genimage-cli-${process.pid}.png`);
  try {
    const res = await main(['a cat logo', '--model', 'fake-image', '--size', '320x200', '--out', out], { providersDir: dir });
    assert.equal(res.code, 0);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.path, out);
    assert.equal(parsed.model, 'fake-image');
    assert.equal(parsed.size, '320x200');
    assert.equal(parsed.cost, 0.02);
    const meta = await sharp(await readFile(out)).metadata();
    assert.equal(meta.width, 320);
    assert.equal(meta.height, 200);
  } finally {
    await unlink(out).catch(() => {});
  }
});

test('--list-models prints image ids only (no video)', async () => {
  const res = await main(['--list-models'], { providersDir: dir });
  assert.equal(res.code, 0);
  assert.match(res.stdout, /fake-image/);
  assert.doesNotMatch(res.stdout, /fake-video/);
});

test('rejects an invalid --size', async () => {
  const res = await main(['a cat', '--size', 'big', '--out', join(tmpdir(), 'x.png')], { providersDir: dir });
  assert.equal(res.code, 1);
  assert.match(res.stderr, /invalid --size/);
});

test('rejects a 0x0 --size', async () => {
  const res = await main(['a cat', '--size', '0x0', '--out', join(tmpdir(), 'x.png')], { providersDir: dir });
  assert.equal(res.code, 1);
  assert.match(res.stderr, /invalid --size/);
});

test('--list-models shows friendly aliases, not raw provider ids', async () => {
  const res = await main(['--list-models']);
  assert.equal(res.code, 0);
  assert.match(res.stdout, /gpt-image-1/);
  assert.match(res.stdout, /gpt-image-2/);
  assert.doesNotMatch(res.stdout, /^openai$/m);
});

test('requires --out', async () => {
  const res = await main(['a cat', '--model', 'fake-image'], { providersDir: dir });
  assert.equal(res.code, 1);
  assert.match(res.stderr, /--out/);
});

test('requires a prompt', async () => {
  const res = await main(['--model', 'fake-image', '--out', join(tmpdir(), 'x.png')], { providersDir: dir });
  assert.equal(res.code, 1);
  assert.match(res.stderr, /prompt is required/);
});

test('resolveModel aliases friendly names to real provider ids', () => {
  assert.equal(resolveModel('gpt-image-1'), 'openai');
  assert.equal(resolveModel('gpt-image-2'), 'openai-gpt-image-2');
  assert.equal(resolveModel('replicate-flux'), 'replicate-flux');
});

test('--help prints usage to stdout and exits 0', async () => {
  const res = await main(['--help'], { providersDir: dir });
  assert.equal(res.code, 0);
  assert.equal(res.stderr, '');
  assert.match(res.stdout, /Usage: genimage/);
  assert.match(res.stdout, /--size <WxH>/);
});

test('-h is an alias for --help', async () => {
  const res = await main(['-h'], { providersDir: dir });
  assert.equal(res.code, 0);
  assert.match(res.stdout, /Options:/);
});
