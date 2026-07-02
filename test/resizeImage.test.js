import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resizeToExact } from '../src/resizeImage.js';

async function solid(w, h) {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 10, g: 20, b: 30 } } }).png().toBuffer();
}

test('resizeToExact writes the exact requested pixel dimensions', async () => {
  const out = join(tmpdir(), `genimage-resize-a-${process.pid}.png`);
  try {
    await resizeToExact(await solid(100, 40), 512, 512, out);
    const meta = await sharp(await readFile(out)).metadata();
    assert.equal(meta.width, 512);
    assert.equal(meta.height, 512);
  } finally {
    await unlink(out).catch(() => {});
  }
});

test('resizeToExact infers the encoder from the extension (webp)', async () => {
  const out = join(tmpdir(), `genimage-resize-b-${process.pid}.webp`);
  try {
    await resizeToExact(await solid(50, 50), 64, 128, out);
    const meta = await sharp(await readFile(out)).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(meta.width, 64);
    assert.equal(meta.height, 128);
  } finally {
    await unlink(out).catch(() => {});
  }
});

test('resizeToExact rejects invalid dimensions', async () => {
  await assert.rejects(() => resizeToExact(Buffer.from('x'), 0, 100, join(tmpdir(), 'nope.png')), /invalid size/);
});
