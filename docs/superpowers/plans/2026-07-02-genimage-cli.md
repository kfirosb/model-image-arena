# genimage CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `genimage` CLI that generates one image (prompt + model + exact size → saved file) for agents to call, reusing the arena's image providers without changing them.

**Architecture:** `bin/genimage.mjs` parses args and orchestrates two small modules: `src/generateImage.js` (find provider by id, generate, return raw bytes) and `src/resizeImage.js` (sharp → exact WxH cover-crop → save). Providers are untouched; all sizing is CLI-side.

**Tech Stack:** Node.js 20.6+ ESM, `node:util` parseArgs, built-in `fetch`, `node:test`, `sharp` (new dependency).

## Global Constraints

- ESM everywhere; `import`, not `require`. Built-in global `fetch` (no node-fetch/axios). `node:test` + `node:assert/strict` (no jest/vitest).
- **Do not change the arena.** Providers keep `generate(prompt)`; no arena file is modified except `package.json` (add `sharp` + `bin`) and `README.md` (add a section). The existing 61 tests must stay green.
- Image models only; a provider with `kind: 'video'` is rejected with a clear message.
- Success prints exactly one JSON line to stdout and exits 0; all errors go to stderr with a non-zero exit.
- Model ids come from the existing providers; default model is `gpt-image-1`; default size is `1024x1024`.
- Output format is inferred from the `--out` file extension (sharp picks the encoder).

---

### Task 1: `sharp` dependency + `resizeImage` module

**Files:**
- Modify: `package.json` (add `sharp` dependency)
- Create: `src/resizeImage.js`
- Create: `test/resizeImage.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `resizeToExact(buffer, width, height, outPath)` — async; writes an image of **exactly** `width`×`height` pixels (cover-crop, centered) to `outPath`, encoder chosen from the extension. Throws `invalid size …` on non-positive/non-integer dimensions.

- [ ] **Step 1: Install sharp**

Run: `npm install sharp`
Expected: `sharp` appears in `package.json` dependencies and installs without error.

- [ ] **Step 2: Write the failing test `test/resizeImage.test.js`**

```js
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
```

- [ ] **Step 3: Run to confirm failure**

Run: `node --test test/resizeImage.test.js`
Expected: FAIL with "Cannot find module '../src/resizeImage.js'".

- [ ] **Step 4: Create `src/resizeImage.js`**

```js
import sharp from 'sharp';

// Write an image of exactly width×height pixels to outPath. Uses cover-crop so
// the result fills the box (no distortion, no letterbox); centered. The output
// encoder is chosen by sharp from the file extension.
export async function resizeToExact(buffer, width, height, outPath) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`invalid size ${width}x${height}`);
  }
  await sharp(buffer)
    .resize(width, height, { fit: 'cover', position: 'center' })
    .toFile(outPath);
}
```

- [ ] **Step 5: Run to confirm pass**

Run: `node --test test/resizeImage.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS — new resize tests plus all existing tests green.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/resizeImage.js test/resizeImage.test.js
git commit -m "feat: add sharp and resizeToExact for exact-size output"
```

---

### Task 2: `generateImage` module

**Files:**
- Create: `src/generateImage.js`
- Create: `test/fixtures/genimage/image.js`
- Create: `test/fixtures/genimage/http.js`
- Create: `test/fixtures/genimage/video.js`
- Create: `test/fixtures/genimage/nokey.js`
- Create: `test/generateImage.test.js`

**Interfaces:**
- Consumes: `loadProviders(dir)` from `src/registry.js` (returns provider objects `{ id, label, kind?, cost, hasKey(), generate(prompt) }`; image `generate` returns `{ image, ms, cost }` where `image` is a `data:` or `https://` URL).
- Produces: `generateImage({ model, prompt, providersDir })` → `Promise<{ buffer, mime, ms, cost }>`. Finds the provider whose `id === model`; throws on unknown model (message lists available image ids), on a `kind:'video'` provider, and on a missing key (message names the env var). Materializes the image URL to a Buffer. Also exports `__setFetch(fn)` (test seam for the https path).

- [ ] **Step 1: Create the fixture providers**

`test/fixtures/genimage/image.js` (returns a real 1×1 PNG data URL so it can be resized end-to-end):

```js
const PNG_1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export default {
  id: 'fake-image',
  label: 'Fake Image',
  cost: 0.02,
  hasKey() { return true; },
  async generate(_prompt) {
    return { image: `data:image/png;base64,${PNG_1x1}`, ms: 5, cost: 0.02 };
  },
};
```

`test/fixtures/genimage/http.js`:

```js
export default {
  id: 'fake-http',
  label: 'Fake HTTP',
  cost: 0.03,
  hasKey() { return true; },
  async generate(_prompt) {
    return { image: 'https://example/img.png', ms: 7, cost: 0.03 };
  },
};
```

`test/fixtures/genimage/video.js`:

```js
export default {
  id: 'fake-video',
  label: 'Fake Video',
  kind: 'video',
  cost: 1.0,
  hasKey() { return true; },
  async generate() { throw new Error('should not be called'); },
};
```

`test/fixtures/genimage/nokey.js`:

```js
export default {
  id: 'fake-nokey',
  label: 'Fake NoKey',
  cost: 0.01,
  hasKey() { return false; },
  async generate() { throw new Error('should not be called'); },
};
```

- [ ] **Step 2: Write the failing test `test/generateImage.test.js`**

```js
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
```

- [ ] **Step 3: Run to confirm failure**

Run: `node --test test/generateImage.test.js`
Expected: FAIL with "Cannot find module '../src/generateImage.js'".

- [ ] **Step 4: Create `src/generateImage.js`**

```js
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadProviders } from './registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROVIDERS_DIR = join(__dirname, '..', 'providers');

// Test seam for the https-download path; real fetch by default.
let _fetch = globalThis.fetch;
export function __setFetch(fn) { _fetch = fn; }

// Best-effort mapping from a model id to the env var it needs, for a precise
// "set X" error. Providers are not changed to expose this.
function envForModel(id) {
  if (/^(gpt-image|openai)/.test(id)) return 'OPENAI_API_KEY';
  if (/^replicate/.test(id)) return 'REPLICATE_API_TOKEN';
  return null;
}

// Turn a provider's `image` (data: URL or https URL) into raw bytes.
async function toBuffer(image) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(image);
  if (m) return { buffer: Buffer.from(m[2], 'base64'), mime: m[1] };
  const res = await _fetch(image);
  if (!res.ok) throw new Error(`failed to download image (${res.status})`);
  const mime = res.headers?.get?.('content-type') || 'image/png';
  return { buffer: Buffer.from(await res.arrayBuffer()), mime };
}

export async function generateImage({ model, prompt, providersDir = DEFAULT_PROVIDERS_DIR }) {
  const providers = await loadProviders(providersDir);
  const provider = providers.find((p) => p.id === model);
  if (!provider) {
    const ids = providers.filter((p) => (p.kind ?? 'image') !== 'video').map((p) => p.id);
    throw new Error(`Unknown model "${model}". Available: ${ids.join(', ')}`);
  }
  if ((provider.kind ?? 'image') === 'video') {
    throw new Error(`"${model}" is a video model; genimage is image-only`);
  }
  if (!provider.hasKey()) {
    const env = envForModel(model);
    throw new Error(`No API key for "${model}". Set ${env || 'its API key'} in .env`);
  }
  const result = await provider.generate(prompt);
  const { buffer, mime } = await toBuffer(result.image);
  return { buffer, mime, ms: result.ms ?? null, cost: result.cost ?? 0 };
}
```

- [ ] **Step 5: Run to confirm pass**

Run: `node --test test/generateImage.test.js`
Expected: PASS (5 tests).

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS — all tests green.

- [ ] **Step 7: Commit**

```bash
git add src/generateImage.js test/fixtures/genimage/ test/generateImage.test.js
git commit -m "feat: add generateImage (provider lookup + image bytes)"
```

---

### Task 3: `genimage` CLI + packaging + README

**Files:**
- Create: `bin/genimage.mjs`
- Create: `test/genimage.test.js`
- Modify: `package.json` (add `bin` entry + `genimage` script)
- Modify: `README.md` (add a "CLI for agents" section)

**Interfaces:**
- Consumes: `generateImage({ model, prompt, providersDir })` (Task 2), `resizeToExact(buffer, width, height, outPath)` (Task 1), `loadProviders(dir)` (registry).
- Produces: `main(argv, { providersDir })` → `Promise<{ code, stdout, stderr }>` (testable, no process.exit). A direct-run wrapper writes the streams and exits with `code`.

- [ ] **Step 1: Write the failing test `test/genimage.test.js`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { main } from '../bin/genimage.mjs';

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
```

- [ ] **Step 2: Run to confirm failure**

Run: `node --test test/genimage.test.js`
Expected: FAIL with "Cannot find module '../bin/genimage.mjs'".

- [ ] **Step 3: Create `bin/genimage.mjs`**

```js
#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateImage } from '../src/generateImage.js';
import { resizeToExact } from '../src/resizeImage.js';
import { loadProviders } from '../src/registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROVIDERS_DIR = join(__dirname, '..', 'providers');

const USAGE = `Usage: genimage "<prompt>" --out <path> [--model <id>] [--size <WxH>]
       genimage --list-models`;

// Returns { code, stdout, stderr } — no process.exit, so it's testable.
export async function main(argv, { providersDir = DEFAULT_PROVIDERS_DIR } = {}) {
  let values, positionals;
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        out: { type: 'string' },
        model: { type: 'string', default: 'gpt-image-1' },
        size: { type: 'string', default: '1024x1024' },
        'list-models': { type: 'boolean', default: false },
      },
    }));
  } catch (err) {
    return { code: 1, stdout: '', stderr: `error: ${err.message}\n${USAGE}\n` };
  }

  if (values['list-models']) {
    const providers = await loadProviders(providersDir);
    const ids = providers.filter((p) => (p.kind ?? 'image') !== 'video').map((p) => p.id);
    return { code: 0, stdout: ids.join('\n') + '\n', stderr: '' };
  }

  const prompt = positionals[0];
  if (!prompt) return { code: 1, stdout: '', stderr: `error: prompt is required\n${USAGE}\n` };
  if (!values.out) return { code: 1, stdout: '', stderr: `error: --out <path> is required\n${USAGE}\n` };

  const sizeMatch = /^(\d+)x(\d+)$/.exec(values.size);
  if (!sizeMatch) return { code: 1, stdout: '', stderr: `error: invalid --size "${values.size}" (expected WxH, e.g. 512x512)\n` };
  const width = Number(sizeMatch[1]);
  const height = Number(sizeMatch[2]);

  try {
    const { buffer, ms, cost } = await generateImage({ model: values.model, prompt, providersDir });
    await resizeToExact(buffer, width, height, values.out);
    const json = JSON.stringify({ path: values.out, model: values.model, size: values.size, ms, cost });
    return { code: 0, stdout: json + '\n', stderr: '' };
  } catch (err) {
    return { code: 1, stdout: '', stderr: `error: ${err.message}\n` };
  }
}

// Run when invoked directly (not when imported by tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const res = await main(process.argv.slice(2));
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  process.exit(res.code);
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `node --test test/genimage.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Add the `bin` entry and a script to `package.json`**

Add these two top-level keys (keep the existing fields):

```json
  "bin": {
    "genimage": "bin/genimage.mjs"
  },
```

And inside `"scripts"`, add:

```json
    "genimage": "node bin/genimage.mjs",
```

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS — all tests green (arena's 61 + resize + generateImage + CLI).

- [ ] **Step 7: Manual smoke test of `--list-models`**

Run: `node bin/genimage.mjs --list-models`
Expected: prints the real image model ids (`gpt-image-1`, `gpt-image-2`, `replicate-flux`, `replicate-flux-pro`, `replicate-ideogram`, `replicate-imagen`), no video ids. (No API call.)

- [ ] **Step 8: Add a README section**

Add this section to `README.md` after the "🎬 Video models (opt-in)" section:

````markdown
## 🤖 Generate images from the CLI (for agents)

Agents (Claude Code and others) can generate a single image at an exact size and
save it to a path — reusing the same models as the arena:

```bash
node bin/genimage.mjs "logo of a cat, flat vector" \
  --model gpt-image-1 \
  --size 512x512 \
  --out ./assets/cat-logo.png
```

Prints one JSON line on success so a calling agent can parse the result:

```json
{"path":"./assets/cat-logo.png","model":"gpt-image-1","size":"512x512","ms":4200,"cost":0.04}
```

- `--model` — default `gpt-image-1`. Run `node bin/genimage.mjs --list-models` to see all image models.
- `--size WxH` — default `1024x1024`. The image is generated then resized/cover-cropped to these **exact** pixels.
- `--out <path>` — required. Output format is taken from the extension (`.png` / `.jpg` / `.webp`).
- Errors print to stderr with a non-zero exit code. Each call spends real API money (see `cost` in the output).
````

- [ ] **Step 9: Commit**

```bash
git add bin/genimage.mjs test/genimage.test.js package.json README.md
git commit -m "feat: add genimage CLI, bin entry, and README section"
```

---

## Self-Review Notes

- **Spec coverage:** one-command generate (Task 3) ✓; reuse image models by id, default gpt-image-1 (Tasks 2/3) ✓; exact pixels via sharp cover-crop (Task 1) ✓; JSON stdout / stderr+non-zero errors (Task 3) ✓; `--list-models` (Task 3) ✓; video-id rejection (Task 2) ✓; missing-key message names env var (Task 2) ✓; format from extension (Task 1 sharp) ✓; arena untouched — only package.json/README modified, providers unchanged, 61 tests stay green (all tasks end with `npm test`) ✓; cost in output + README note (Task 3) ✓.
- **Type consistency:** `resizeToExact(buffer, width, height, outPath)` (Task 1) is called with those exact args in Task 3. `generateImage({ model, prompt, providersDir })` → `{ buffer, mime, ms, cost }` (Task 2) is consumed unchanged in Task 3. `main(argv, { providersDir })` → `{ code, stdout, stderr }` (Task 3) matches its tests. Fixture provider ids (`fake-image`/`fake-http`/`fake-video`/`fake-nokey`) are referenced consistently across Tasks 2 and 3.
- **Deferred (YAGNI):** no video, no batch, no aspect-aware model-size hint (CLI cover-crops instead), no server dependency.
