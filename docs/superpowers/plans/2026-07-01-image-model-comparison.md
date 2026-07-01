# Image Model Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local Node.js web app that sends one prompt to many image-generation models in parallel and shows every result in a labeled grid.

**Architecture:** Express server serves a static page and two JSON endpoints. A registry auto-discovers provider plugin files in `providers/`. On generate, the server runs every keyed provider in parallel with a per-model timeout, and returns per-model results (image, time, cost, status). Unkeyed providers are reported as `no_key` and never called. The browser renders a tile per provider.

**Tech Stack:** Node.js 24 (ES modules, built-in `fetch`, `node:test`), Express, plain HTML/CSS/JS (no build step).

## Global Constraints

- Node.js ES modules everywhere (`"type": "module"` in package.json). Use `import`, not `require`.
- Use the built-in global `fetch` — do NOT add `node-fetch` or `axios`.
- Use the built-in `node:test` runner and `node:assert/strict` — do NOT add jest/vitest.
- API keys are read from `process.env` only. Never send keys to the browser. `.env` is gitignored.
- Every provider module exports a default object matching the contract: `{ id, label, hasKey(), generate(prompt) }` where `generate` returns `{ image, ms, cost }`.
- `image` returned by a provider is a string the browser can put in `<img src>` directly: either an `https://` URL or a `data:image/...;base64,...` data URL.
- Server default port: `process.env.PORT || 3000`.

---

### Task 1: Project scaffold and static server

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `server.js`
- Create: `public/index.html`
- Create: `test/health.test.js`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: an Express `app` and a `start(port)` function exported from `server.js`. `start(port)` returns the Node `http.Server`. `GET /api/health` returns `{ ok: true }`. Static files in `public/` served at `/`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "model-image-test",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "start": "node --env-file=.env server.js",
    "dev": "node --env-file=.env --watch server.js",
    "test": "node --test"
  },
  "dependencies": {
    "express": "^4.19.2"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
.env
runs/
```

- [ ] **Step 3: Create `.env.example`**

```
# Copy this file to .env and fill in the keys you have.
# Only providers whose key is set will run; others are skipped in the UI.
PORT=3000
OPENAI_API_KEY=
REPLICATE_API_TOKEN=
```

- [ ] **Step 4: Create `public/index.html` (placeholder for now)**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Image Model Comparison</title>
  </head>
  <body>
    <h1>Image Model Comparison</h1>
    <p>Coming soon.</p>
  </body>
</html>
```

- [ ] **Step 5: Create `server.js`**

```js
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

export function start(port = process.env.PORT || 3000) {
  return app.listen(port, () => {
    console.log(`Image Model Comparison running at http://localhost:${port}`);
  });
}

// Start only when run directly, not when imported by tests.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start();
}
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: creates `node_modules/` and `package-lock.json`, no errors.

- [ ] **Step 7: Write the failing test `test/health.test.js`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { start } from '../server.js';

test('GET /api/health returns ok', async () => {
  const server = start(0); // port 0 = random free port
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  try {
    const res = await fetch(`http://localhost:${port}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { ok: true });
  } finally {
    server.close();
  }
});
```

- [ ] **Step 8: Run the test**

Run: `npm test`
Expected: PASS (1 test). If it fails, fix `server.js` until green.

- [ ] **Step 9: Manual check**

Run: `PORT=3000 node server.js` then open `http://localhost:3000` in a browser.
Expected: the placeholder page loads. Stop the server with Ctrl-C.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json .gitignore .env.example server.js public/index.html test/health.test.js
git commit -m "feat: scaffold express server with health check"
```

---

### Task 2: Provider registry (auto-discovery)

**Files:**
- Create: `src/registry.js`
- Create: `test/registry.test.js`
- Create: `test/fixtures/providers/good.js`
- Create: `test/fixtures/providers/nokey.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `loadProviders(dir)` — an async function that dynamically imports every `.js` file in `dir` and returns an array of provider objects (each file's `default` export), sorted by `id`. Each provider object has `{ id, label, hasKey(), generate(prompt) }`.

- [ ] **Step 1: Write the failing test `test/registry.test.js`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadProviders } from '../src/registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures', 'providers');

test('loadProviders imports every file and sorts by id', async () => {
  const providers = await loadProviders(fixturesDir);
  assert.equal(providers.length, 2);
  assert.deepEqual(providers.map((p) => p.id), ['good', 'nokey']);
  assert.equal(typeof providers[0].generate, 'function');
  assert.equal(providers[0].hasKey(), true);
  assert.equal(providers[1].hasKey(), false);
});
```

- [ ] **Step 2: Create fixture `test/fixtures/providers/good.js`**

```js
export default {
  id: 'good',
  label: 'Good Fixture',
  hasKey() { return true; },
  async generate(_prompt) {
    return { image: 'data:image/png;base64,AAAA', ms: 5, cost: 0 };
  },
};
```

- [ ] **Step 3: Create fixture `test/fixtures/providers/nokey.js`**

```js
export default {
  id: 'nokey',
  label: 'No Key Fixture',
  hasKey() { return false; },
  async generate(_prompt) {
    throw new Error('should never be called without a key');
  },
};
```

- [ ] **Step 4: Run the test to confirm it fails**

Run: `node --test test/registry.test.js`
Expected: FAIL with "Cannot find module '../src/registry.js'".

- [ ] **Step 5: Create `src/registry.js`**

```js
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadProviders(dir) {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.js'));
  const providers = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(join(dir, file)).href);
    if (mod.default && mod.default.id) providers.push(mod.default);
  }
  providers.sort((a, b) => a.id.localeCompare(b.id));
  return providers;
}
```

- [ ] **Step 6: Run the test to confirm it passes**

Run: `node --test test/registry.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/registry.js test/registry.test.js test/fixtures/
git commit -m "feat: add auto-discovery provider registry"
```

---

### Task 3: Run-one-provider helper (timeout + status mapping)

**Files:**
- Create: `src/runProvider.js`
- Create: `test/runProvider.test.js`

**Interfaces:**
- Consumes: provider objects `{ id, label, hasKey(), generate(prompt) }` from the registry (Task 2).
- Produces: `runOne(provider, prompt, timeoutMs = 60000)` — async, always resolves (never throws), returning one of:
  - `{ id, label, status: 'no_key' }` when `hasKey()` is false (generate not called).
  - `{ id, label, status: 'done', image, ms, cost }` on success.
  - `{ id, label, status: 'error', error }` on thrown error or timeout (`error` is a string).

- [ ] **Step 1: Write the failing test `test/runProvider.test.js`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { runOne } from '../src/runProvider.js';

const make = (over) => ({
  id: 'p', label: 'P',
  hasKey: () => true,
  generate: async () => ({ image: 'data:x', ms: 1, cost: 0 }),
  ...over,
});

test('no key -> no_key status, generate not called', async () => {
  let called = false;
  const p = make({ hasKey: () => false, generate: async () => { called = true; } });
  const r = await runOne(p, 'frog');
  assert.equal(r.status, 'no_key');
  assert.equal(called, false);
});

test('success -> done with image/ms/cost', async () => {
  const r = await runOne(make(), 'frog');
  assert.equal(r.status, 'done');
  assert.equal(r.image, 'data:x');
  assert.equal(r.id, 'p');
});

test('thrown error -> error status', async () => {
  const p = make({ generate: async () => { throw new Error('boom'); } });
  const r = await runOne(p, 'frog');
  assert.equal(r.status, 'error');
  assert.match(r.error, /boom/);
});

test('timeout -> error status', async () => {
  const p = make({ generate: () => new Promise(() => {}) }); // never resolves
  const r = await runOne(p, 'frog', 20);
  assert.equal(r.status, 'error');
  assert.match(r.error, /timed out/i);
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `node --test test/runProvider.test.js`
Expected: FAIL with "Cannot find module '../src/runProvider.js'".

- [ ] **Step 3: Create `src/runProvider.js`**

```js
export async function runOne(provider, prompt, timeoutMs = 60000) {
  const { id, label } = provider;
  if (!provider.hasKey()) return { id, label, status: 'no_key' };

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), timeoutMs);
  });

  try {
    const out = await Promise.race([provider.generate(prompt), timeout]);
    return {
      id, label, status: 'done',
      image: out.image,
      ms: out.ms ?? null,
      cost: out.cost ?? 0,
    };
  } catch (err) {
    return { id, label, status: 'error', error: String(err.message || err) };
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test test/runProvider.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/runProvider.js test/runProvider.test.js
git commit -m "feat: add runOne provider helper with timeout and status mapping"
```

---

### Task 4: OpenAI provider

**Files:**
- Create: `providers/openai.js`
- Create: `test/openai.test.js`

**Interfaces:**
- Consumes: the provider contract (Global Constraints).
- Produces: `providers/openai.js` default export `{ id: 'openai', label: 'OpenAI gpt-image-1', hasKey(), generate(prompt) }`. `hasKey()` returns `!!process.env.OPENAI_API_KEY`. `generate` calls the OpenAI images API with the module-level `fetch` and returns `{ image, ms, cost }` where `image` is a `data:image/png;base64,...` URL built from `data[0].b64_json`.

- [ ] **Step 1: Write the failing test `test/openai.test.js`**

The test injects a fake `fetch` via a setter so no real API is called.

```js
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
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `node --test test/openai.test.js`
Expected: FAIL with "Cannot find module '../providers/openai.js'".

- [ ] **Step 3: Create `providers/openai.js`**

```js
// Allow tests to inject a fake fetch; default to global fetch.
let _fetch = globalThis.fetch;
export function __setFetch(fn) { _fetch = fn; }

const COST_PER_IMAGE = 0.04; // rough estimate for gpt-image-1 1024x1024

export default {
  id: 'openai',
  label: 'OpenAI gpt-image-1',
  hasKey() { return !!process.env.OPENAI_API_KEY; },
  async generate(prompt) {
    const started = Date.now();
    const res = await _fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt,
        n: 1,
        size: '1024x1024',
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`OpenAI ${res.status}: ${detail.slice(0, 300)}`);
    }
    const data = await res.json();
    const b64 = data.data[0].b64_json;
    return {
      image: `data:image/png;base64,${b64}`,
      ms: Date.now() - started,
      cost: COST_PER_IMAGE,
    };
  },
};
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test test/openai.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add providers/openai.js test/openai.test.js
git commit -m "feat: add OpenAI image provider"
```

---

### Task 5: Generate + providers API endpoints

**Files:**
- Modify: `server.js`
- Create: `src/generate.js`
- Create: `test/generate.test.js`

**Interfaces:**
- Consumes: `loadProviders(dir)` (Task 2), `runOne(provider, prompt, timeoutMs)` (Task 3).
- Produces:
  - `src/generate.js` exports `generateAll(providers, prompt)` → `Promise<Array>` of `runOne` results, run in parallel with `Promise.all` (each `runOne` already never rejects), and `listProviders(providers)` → `Array<{ id, label, status }>` where status is `'no_key'` or `'ready'`.
  - `server.js` gains `GET /api/providers` → `{ providers: listProviders(...) }` and `POST /api/generate` `{ prompt }` → `{ prompt, results }`. Both load providers from the real `providers/` directory.

- [ ] **Step 1: Write the failing test `test/generate.test.js`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAll, listProviders } from '../src/generate.js';

const good = {
  id: 'good', label: 'Good', hasKey: () => true,
  generate: async () => ({ image: 'data:x', ms: 3, cost: 0.01 }),
};
const bad = {
  id: 'bad', label: 'Bad', hasKey: () => true,
  generate: async () => { throw new Error('nope'); },
};
const nokey = {
  id: 'nokey', label: 'NoKey', hasKey: () => false,
  generate: async () => ({ image: 'x' }),
};

test('generateAll runs all and one failure does not break others', async () => {
  const results = await generateAll([good, bad, nokey], 'frog');
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  assert.equal(byId.good.status, 'done');
  assert.equal(byId.bad.status, 'error');
  assert.equal(byId.nokey.status, 'no_key');
});

test('listProviders reports ready/no_key without calling generate', () => {
  const list = listProviders([good, nokey]);
  assert.deepEqual(list, [
    { id: 'good', label: 'Good', status: 'ready' },
    { id: 'nokey', label: 'NoKey', status: 'no_key' },
  ]);
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `node --test test/generate.test.js`
Expected: FAIL with "Cannot find module '../src/generate.js'".

- [ ] **Step 3: Create `src/generate.js`**

```js
import { runOne } from './runProvider.js';

export function generateAll(providers, prompt) {
  return Promise.all(providers.map((p) => runOne(p, prompt)));
}

export function listProviders(providers) {
  return providers.map((p) => ({
    id: p.id,
    label: p.label,
    status: p.hasKey() ? 'ready' : 'no_key',
  }));
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test test/generate.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the endpoints into `server.js`**

Add these imports at the top of `server.js` (below the existing imports):

```js
import { loadProviders } from './src/registry.js';
import { generateAll, listProviders } from './src/generate.js';

const providersDir = join(__dirname, 'providers');
```

Add these routes after the `/api/health` route:

```js
app.get('/api/providers', async (_req, res) => {
  const providers = await loadProviders(providersDir);
  res.json({ providers: listProviders(providers) });
});

app.post('/api/generate', async (req, res) => {
  const prompt = (req.body?.prompt || '').trim();
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  const providers = await loadProviders(providersDir);
  const results = await generateAll(providers, prompt);
  res.json({ prompt, results });
});
```

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests from Tasks 1–5 green.

- [ ] **Step 7: Manual check of the providers endpoint**

Run: `OPENAI_API_KEY= node server.js` in one terminal, then in another:
`curl -s http://localhost:3000/api/providers`
Expected: JSON listing `openai` with `"status":"no_key"`. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add server.js src/generate.js test/generate.test.js
git commit -m "feat: add /api/providers and /api/generate endpoints"
```

---

### Task 6: Frontend page (prompt box + result grid)

**Files:**
- Modify: `public/index.html`
- Create: `public/style.css`
- Create: `public/app.js`

**Interfaces:**
- Consumes: `GET /api/providers` and `POST /api/generate` (Task 5).
- Produces: a working single-page UI. No automated test (DOM/visual); verified manually via the checklist in Step 4.

- [ ] **Step 1: Replace `public/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Image Model Comparison</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <header>
      <h1>Image Model Comparison</h1>
      <form id="prompt-form">
        <input id="prompt" type="text" placeholder="a frog" autocomplete="off" />
        <button id="go" type="submit">Generate</button>
      </form>
      <p id="status" class="status"></p>
    </header>
    <main>
      <div id="grid" class="grid"></div>
    </main>
    <script src="app.js" type="module"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `public/style.css`**

```css
* { box-sizing: border-box; }
body { font-family: system-ui, sans-serif; margin: 0; background: #0f1115; color: #e8e8ea; }
header { padding: 20px; border-bottom: 1px solid #23262d; }
h1 { margin: 0 0 12px; font-size: 20px; }
#prompt-form { display: flex; gap: 8px; }
#prompt { flex: 1; padding: 10px 12px; font-size: 16px; border-radius: 8px; border: 1px solid #333; background: #171a21; color: #fff; }
#go { padding: 10px 18px; font-size: 16px; border: 0; border-radius: 8px; background: #4f7cff; color: #fff; cursor: pointer; }
#go:disabled { opacity: 0.5; cursor: default; }
.status { color: #9aa0aa; min-height: 18px; margin: 8px 0 0; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; padding: 20px; }
.tile { background: #171a21; border: 1px solid #23262d; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; }
.tile .imgwrap { aspect-ratio: 1; display: flex; align-items: center; justify-content: center; background: #0c0e12; position: relative; }
.tile img { width: 100%; height: 100%; object-fit: cover; }
.tile .meta { padding: 10px 12px; font-size: 13px; }
.tile .label { font-weight: 600; display: flex; justify-content: space-between; align-items: center; }
.tile .sub { color: #9aa0aa; margin-top: 4px; }
.tile.no_key .imgwrap::after { content: "no API key"; color: #6b7280; }
.tile.error .imgwrap::after { content: attr(data-error); color: #ff6b6b; padding: 10px; text-align: center; font-size: 12px; }
.tile.loading .imgwrap::after { content: "generating…"; color: #9aa0aa; }
.star { background: none; border: 0; cursor: pointer; font-size: 16px; color: #555; }
.star.on { color: #ffd23f; }
```

- [ ] **Step 3: Create `public/app.js`**

```js
const form = document.getElementById('prompt-form');
const promptEl = document.getElementById('prompt');
const goBtn = document.getElementById('go');
const statusEl = document.getElementById('status');
const grid = document.getElementById('grid');

const tiles = new Map(); // id -> tile element

function tile(id, label) {
  let el = tiles.get(id);
  if (!el) {
    el = document.createElement('div');
    el.className = 'tile';
    el.innerHTML = `
      <div class="imgwrap"></div>
      <div class="meta">
        <div class="label"><span class="name"></span><button class="star" title="favorite">★</button></div>
        <div class="sub"></div>
      </div>`;
    el.querySelector('.star').addEventListener('click', (e) => {
      e.currentTarget.classList.toggle('on');
    });
    grid.appendChild(el);
    tiles.set(id, el);
  }
  el.querySelector('.name').textContent = label;
  return el;
}

function render(id, label, state) {
  const el = tile(id, label);
  const wrap = el.querySelector('.imgwrap');
  const sub = el.querySelector('.sub');
  el.className = `tile ${state.status}`;
  wrap.querySelectorAll('img').forEach((n) => n.remove());
  el.removeAttribute('data-error');
  if (state.status === 'done') {
    const img = document.createElement('img');
    img.src = state.image;
    img.alt = label;
    wrap.appendChild(img);
    const cost = state.cost ? `$${state.cost.toFixed(3)}` : '—';
    sub.textContent = `${state.ms ?? '?'} ms · ${cost}`;
  } else if (state.status === 'error') {
    el.setAttribute('data-error', state.error || 'error');
    sub.textContent = 'failed';
  } else if (state.status === 'no_key') {
    sub.textContent = 'add key in .env to enable';
  } else {
    sub.textContent = '';
  }
}

async function loadProviders() {
  const res = await fetch('/api/providers');
  const { providers } = await res.json();
  grid.innerHTML = '';
  tiles.clear();
  for (const p of providers) render(p.id, p.label, { status: p.status });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const prompt = promptEl.value.trim();
  if (!prompt) return;
  goBtn.disabled = true;
  statusEl.textContent = 'Generating…';
  // Set keyed tiles to loading; leave no_key tiles as-is.
  for (const [id, el] of tiles) {
    if (!el.classList.contains('no_key')) {
      render(id, el.querySelector('.name').textContent, { status: 'loading' });
    }
  }
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'request failed');
    for (const r of data.results) render(r.id, r.label, r);
    statusEl.textContent = `Done: "${data.prompt}"`;
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  } finally {
    goBtn.disabled = false;
  }
});

loadProviders();
```

- [ ] **Step 4: Manual verification checklist**

Run: `OPENAI_API_KEY= node server.js`, open `http://localhost:3000`.
- [ ] Page shows one tile per provider; `openai` tile shows "no API key" (grey).
- [ ] Typing a prompt and clicking Generate keeps no-key tiles grey and does not error.
- [ ] Clicking ★ toggles gold.

Stop the server. Now run with a real key: `OPENAI_API_KEY=sk-... node server.js`.
- [ ] The `openai` tile is no longer grey.
- [ ] Enter "a frog", click Generate: tile shows "generating…" then a frog image with ms + cost.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/style.css public/app.js
git commit -m "feat: add frontend prompt box and result grid"
```

---

### Task 7: Replicate provider (unlocks multiple models)

**Files:**
- Create: `providers/replicate.js`
- Create: `test/replicate.test.js`

**Interfaces:**
- Consumes: the provider contract (Global Constraints).
- Produces: `providers/replicate.js` default export `{ id: 'replicate-flux', label: 'Replicate FLUX schnell', hasKey(), generate(prompt) }`. `hasKey()` returns `!!process.env.REPLICATE_API_TOKEN`. `generate` POSTs to the Replicate model-predictions endpoint with the `Prefer: wait` header (synchronous result) and returns `{ image, ms, cost }` where `image` is the first URL in the prediction `output` array. Also exports `__setFetch` for tests.

- [ ] **Step 1: Write the failing test `test/replicate.test.js`**

```js
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
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `node --test test/replicate.test.js`
Expected: FAIL with "Cannot find module '../providers/replicate.js'".

- [ ] **Step 3: Create `providers/replicate.js`**

```js
let _fetch = globalThis.fetch;
export function __setFetch(fn) { _fetch = fn; }

const MODEL = 'black-forest-labs/flux-schnell';
const COST_PER_IMAGE = 0.003; // rough estimate

export default {
  id: 'replicate-flux',
  label: 'Replicate FLUX schnell',
  hasKey() { return !!process.env.REPLICATE_API_TOKEN; },
  async generate(prompt) {
    const started = Date.now();
    const res = await _fetch(
      `https://api.replicate.com/v1/models/${MODEL}/predictions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json',
          'Prefer': 'wait',
        },
        body: JSON.stringify({ input: { prompt, num_outputs: 1 } }),
      },
    );
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Replicate ${res.status}: ${detail.slice(0, 300)}`);
    }
    const data = await res.json();
    if (data.status !== 'succeeded') {
      throw new Error(`Replicate prediction ${data.status}: ${data.error || ''}`);
    }
    const image = Array.isArray(data.output) ? data.output[0] : data.output;
    return { image, ms: Date.now() - started, cost: COST_PER_IMAGE };
  },
};
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test test/replicate.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Full suite + commit**

Run: `npm test`
Expected: PASS — every test green.

```bash
git add providers/replicate.js test/replicate.test.js
git commit -m "feat: add Replicate FLUX provider"
```

---

### Task 8: README with setup and how to add a provider

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: docs only. No test.

- [ ] **Step 1: Create `README.md`**

````markdown
# Image Model Comparison

Local tool to send one prompt to several image-generation models in parallel
and compare the results in a grid.

## Setup

```bash
npm install
cp .env.example .env   # then fill in the keys you have
npm start              # open http://localhost:3000
```

Only providers whose key is set in `.env` will run. Others show a grey
"no API key" tile until you add their key.

## Keys

- `OPENAI_API_KEY` — OpenAI gpt-image-1.
- `REPLICATE_API_TOKEN` — Replicate (FLUX schnell here; unlocks many more models).

## Add a new model

Drop a file in `providers/`, e.g. `providers/mymodel.js`:

```js
export default {
  id: 'mymodel',
  label: 'My Model',
  hasKey() { return !!process.env.MYMODEL_KEY; },
  async generate(prompt) {
    // return { image, ms, cost }
    // image: an https URL or a data:image/...;base64,... URL
  },
};
```

Restart the server — it is auto-discovered. Add `MYMODEL_KEY` to `.env`.

## Test

```bash
npm test
```

All provider tests mock HTTP, so they never spend real API credits.
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup and provider guide"
```

---

## Self-Review Notes

- **Spec coverage:** local web page (Task 6) ✓; parallel fan-out (Task 5, `generateAll`) ✓; pluggable providers + auto-discovery (Task 2) ✓; auto-skip no-key with placeholder tile (Tasks 3/5/6) ✓; per-model timeout + one-failure-isolation (Tasks 3/5) ✓; keys in `.env`, never to browser (Task 1 gitignore, server never returns keys) ✓; grid with image/label/time/cost/★ (Task 6) ✓; contract tests with mocked HTTP + isolation test (Tasks 4/5/7) ✓; OpenAI works today (Task 4) ✓; Replicate for 5-model bake-off (Task 7) ✓; README (Task 8) ✓.
- **Deferred by design (YAGNI, in spec non-goals):** save-run-to-folder, Google/FLUX/Fal.ai/Ideogram providers (add later as plugin files following Task 4/7 pattern), cost totals. `runs/` is gitignored so save-to-folder can be added later without a scaffolding change.
- **Type consistency:** `runOne` result shape (`{ id, label, status, image?, ms?, cost?, error? }`) is produced in Task 3 and consumed unchanged by `generateAll` (Task 5) and `app.js` `render` (Task 6). `generate` return shape `{ image, ms, cost }` is identical across Tasks 4 and 7 and matches the contract. `__setFetch` test seam is consistent between OpenAI and Replicate providers.
