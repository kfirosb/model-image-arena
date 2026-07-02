import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

// Write an image of exactly width×height pixels to outPath. Uses cover-crop so
// the result fills the box (no distortion, no letterbox); centered. The output
// encoder is chosen by sharp from the file extension. Parent directories are
// created if they don't exist, so callers can write to any path.
export async function resizeToExact(buffer, width, height, outPath) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`invalid size ${width}x${height}`);
  }
  await mkdir(dirname(outPath), { recursive: true });
  await sharp(buffer)
    .resize(width, height, { fit: 'cover', position: 'center' })
    .toFile(outPath);
}
