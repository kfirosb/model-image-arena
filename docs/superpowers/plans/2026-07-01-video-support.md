# Video Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in text-to-video models (Sora, Veo, Kling, Wan, Hailuo, LTX, Hunyuan) to Model Image Arena alongside the existing image models, with per-model selection and a live cost estimate, without changing any existing image behavior.

**Architecture:** Video providers are pluggable files like image providers, but declare `kind:'video'`, a top-level `cost`, and a longer `timeoutMs`, and their `generate()` uses create-then-poll HTTP instead of a synchronous call. `runOne` and the API are extended additively so image results are byte-identical to today. The frontend adds a checkbox per model (video unchecked by default) and sends only the selected ids.

**Tech Stack:** Node.js 20.6+ ESM, built-in `fetch`, `node:test`, Express, plain HTML/CSS/JS.

## Global Constraints

- ESM everywhere; use `import`, not `require`. Built-in global `fetch` only (no node-fetch/axios). Built-in `node:test` + `node:assert/strict` (no jest/vitest).
- **Do not change existing image behavior.** Image providers keep returning `{ image, ms, cost }`; all existing tests must stay green. Every change is additive.
- API keys read only from `process.env` (`OPENAI_API_KEY`, `REPLICATE_API_TOKEN`); never returned to the browser.
- Provider result field names are exact: image → `{ image, ms, cost }`; video → `{ video, type: 'video', ms, cost }`. A playable value in `video`/`image` is a string usable directly in `<video src>`/`<img src>` (an `https://` URL or a `data:…;base64,…` URL).
- Video providers declare `kind: 'video'`, top-level `cost` (estimated USD/run), and `timeoutMs`. Image providers omit `kind` (treated as `'image'`).
- All tests mock HTTP and inject sleep — no real network, no real spend, no real delays.

---

### Task 1: Extend `runOne` for video passthrough + per-provider timeout

**Files:**
- Modify: `src/runProvider.js`
- Test: `test/runProvider.test.js`

**Interfaces:**
- Consumes: a provider `{ id, label, hasKey(), generate(prompt), timeoutMs? }`.
- Produces: `runOne` done-result now includes `type` (`out.type ?? 'image'`) and `video` (`out.video ?? null`) in addition to the existing `image`/`ms`/`cost`; and uses `provider.timeoutMs ?? timeoutMs` for the timeout. Image results are unchanged except for the two new fields (`type:'image'`, `video:null`).

- [ ] **Step 1: Add failing tests to `test/runProvider.test.js`**

Append these tests (keep the existing ones):

```js
test('passes through video/type from a video provider result', async () => {
  const p = {
    id: 'v', label: 'V', hasKey: () => true,
    generate: async () => ({ video: 'https://x/clip.mp4', type: 'video', ms: 9, cost: 0.3 }),
  };
  const r = await runOne(p, 'frog');
  assert.equal(r.status, 'done');
  assert.equal(r.type, 'video');
  assert.equal(r.video, 'https://x/clip.mp4');
  assert.equal(r.cost, 0.3);
});

test('image result still reports type image and null video', async () => {
  const p = {
    id: 'i', label: 'I', hasKey: () => true,
    generate: async () => ({ image: 'data:x', ms: 1, cost: 0 }),
  };
  const r = await runOne(p, 'frog');
  assert.equal(r.type, 'image');
  assert.equal(r.image, 'data:x');
  assert.equal(r.video, null);
});

test('honors a provider-declared timeoutMs', async () => {
  const p = {
    id: 't', label: 'T', hasKey: () => true, timeoutMs: 15,
    generate: () => new Promise(() => {}), // never resolves
  };
  const r = await runOne(p, 'frog');
  assert.equal(r.status, 'error');
  assert.match(r.error, /timed out/i);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `node --test test/runProvider.test.js`
Expected: the 3 new tests FAIL (missing `type`/`video`, or timeout not honored).

- [ ] **Step 3: Update `src/runProvider.js`**

Replace the function body's timeout line and done-return:

```js
export async function runOne(provider, prompt, timeoutMs = 60000) {
  // id/label are read defensively so a malformed provider never causes a
  // rejection below — runOne must always resolve.
  const id = provider?.id;
  const label = provider?.label;
  const limitMs = provider?.timeoutMs ?? timeoutMs;

  let timer;
  try {
    if (!provider.hasKey()) return { id, label, status: 'no_key' };

    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timed out')), limitMs);
    });

    const out = await Promise.race([provider.generate(prompt), timeout]);
    return {
      id, label, status: 'done',
      type: out.type ?? 'image',
      image: out.image ?? null,
      video: out.video ?? null,
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

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS — new runProvider tests green AND every existing test still green.

- [ ] **Step 5: Commit**

```bash
git add src/runProvider.js test/runProvider.test.js
git commit -m "feat: runOne passes through video/type and honors provider timeoutMs"
```

---

### Task 2: Model selection (`ids`) + `kind`/`cost` in the API

**Files:**
- Modify: `src/generate.js`
- Modify: `server.js`
- Modify: `src/openaiProvider.js` (expose `cost` on the provider object)
- Modify: `src/replicateProvider.js` (expose `cost` on the provider object)
- Test: `test/generate.test.js`

**Interfaces:**
- Consumes: providers `{ id, label, hasKey(), kind?, cost? }`.
- Produces:
  - `generateAll(providers, prompt, ids)` — if `ids` is a non-empty array, only providers whose `id` is in `ids` run; otherwise all run (unchanged default).
  - `listProviders(providers)` → `[{ id, label, kind, cost, status }]` where `kind = p.kind ?? 'image'`, `cost = p.cost ?? 0`, `status = p.hasKey() ? 'ready' : 'no_key'`.
  - `POST /api/generate { prompt, ids? }` passes `ids` through. `GET /api/providers` returns the richer list.
  - `makeOpenAIProvider`/`makeReplicateProvider` returned objects now include a top-level `cost` (so the UI can total it) — no change to generation behavior.

- [ ] **Step 1: Update `test/generate.test.js`**

Replace the two fake providers' definitions to include `cost`/`kind`, and add tests. Full new file:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAll, listProviders } from '../src/generate.js';

const good = {
  id: 'good', label: 'Good', kind: 'image', cost: 0.01, hasKey: () => true,
  generate: async () => ({ image: 'data:x', ms: 3, cost: 0.01 }),
};
const vid = {
  id: 'vid', label: 'Vid', kind: 'video', cost: 0.3, hasKey: () => true,
  generate: async () => ({ video: 'https://x/c.mp4', type: 'video', ms: 5, cost: 0.3 }),
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

test('generateAll with ids runs only the selected providers', async () => {
  const results = await generateAll([good, vid, bad], 'frog', ['vid']);
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'vid');
  assert.equal(results[0].type, 'video');
});

test('generateAll ignores an empty ids array (runs all)', async () => {
  const results = await generateAll([good, vid], 'frog', []);
  assert.equal(results.length, 2);
});

test('listProviders reports kind, cost, status without calling generate', () => {
  const list = listProviders([good, vid, nokey]);
  assert.deepEqual(list, [
    { id: 'good', label: 'Good', kind: 'image', cost: 0.01, status: 'ready' },
    { id: 'vid', label: 'Vid', kind: 'video', cost: 0.3, status: 'ready' },
    { id: 'nokey', label: 'NoKey', kind: 'image', cost: 0, status: 'no_key' },
  ]);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `node --test test/generate.test.js`
Expected: FAIL (ids param and kind/cost not implemented).

- [ ] **Step 3: Update `src/generate.js`**

```js
import { runOne } from './runProvider.js';

export function generateAll(providers, prompt, ids) {
  const selected = Array.isArray(ids) && ids.length
    ? providers.filter((p) => ids.includes(p.id))
    : providers;
  return Promise.all(selected.map((p) => runOne(p, prompt)));
}

export function listProviders(providers) {
  return providers.map((p) => ({
    id: p.id,
    label: p.label,
    kind: p.kind ?? 'image',
    cost: p.cost ?? 0,
    status: p.hasKey() ? 'ready' : 'no_key',
  }));
}
```

- [ ] **Step 4: Pass `ids` through in `server.js`**

Find the `/api/generate` handler and change the generate call to read `ids`:

```js
app.post('/api/generate', async (req, res) => {
  try {
    const prompt = (req.body?.prompt || '').trim();
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : undefined;
    const providers = await loadProviders(providersDir);
    const results = await generateAll(providers, prompt, ids);
    res.json({ prompt, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});
```

(Leave `/api/providers` as-is — it already calls `listProviders`, which now returns the richer shape.)

- [ ] **Step 5: Expose `cost` on the image provider objects**

In `src/openaiProvider.js`, add `cost` to the returned object (right after `label`):

```js
  return {
    id,
    label,
    cost,
    hasKey() { return !!process.env.OPENAI_API_KEY; },
```

In `src/replicateProvider.js`, add `cost` to the returned object (right after `label`):

```js
  return {
    id,
    label,
    cost,
    hasKey() { return !!process.env.REPLICATE_API_TOKEN; },
```

- [ ] **Step 6: Run the whole suite + a manual providers check**

Run: `npm test`
Expected: PASS — all tests green.

Run: `OPENAI_API_KEY= REPLICATE_API_TOKEN= node server.js &` then `curl -s http://localhost:3000/api/providers`; expect each entry to have `kind` and `cost` fields. Kill the server.

- [ ] **Step 7: Commit**

```bash
git add src/generate.js server.js src/openaiProvider.js src/replicateProvider.js test/generate.test.js
git commit -m "feat: per-model selection (ids) and kind/cost in providers API"
```

---

### Task 3: Extract shared Replicate HTTP client

**Files:**
- Create: `src/replicateClient.js`
- Modify: `src/replicateProvider.js`
- Test: `test/replicateClient.test.js`
- (existing `test/replicateProvider.test.js`, `test/replicate.test.js`, `test/replicate-models.test.js` must stay green)

**Interfaces:**
- Consumes: `process.env.REPLICATE_API_TOKEN`, `REPLICATE_CONCURRENCY`.
- Produces `src/replicateClient.js` exports:
  - `__setFetch(fn)`, `__setSleep(fn)` — test seams shared by all Replicate providers.
  - `replicateHeaders(extra = {})` → `{ Authorization, 'Content-Type': 'application/json', ...extra }`.
  - `withSlot(fn)` — concurrency limiter (default 1 via `REPLICATE_CONCURRENCY`).
  - `postWithRetry(url, options)` → ok `Response` (retries HTTP 429 up to 4 attempts using `retry_after`).
  - `getJson(url)` → parsed JSON of a GET (auth headers); throws `Replicate <status>: <body>` on non-ok.
  - `sleep(ms)` → delegates to the injected sleep.
- `src/replicateProvider.js` re-exports `__setFetch`/`__setSleep` from the client (so `providers/replicate.js` and the existing tests keep working) and uses `withSlot`/`postWithRetry`/`replicateHeaders`. **No behavior change.**

- [ ] **Step 1: Create `test/replicateClient.test.js` (failing)**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { postWithRetry, getJson, withSlot, replicateHeaders, __setFetch, __setSleep } from '../src/replicateClient.js';

__setSleep(async () => {});

test('replicateHeaders includes auth and merges extra', () => {
  process.env.REPLICATE_API_TOKEN = 'r8_test';
  const h = replicateHeaders({ Prefer: 'wait' });
  assert.equal(h.Authorization, 'Bearer r8_test');
  assert.equal(h['Content-Type'], 'application/json');
  assert.equal(h.Prefer, 'wait');
});

test('postWithRetry retries on 429 then returns ok response', async () => {
  let calls = 0;
  __setFetch(async () => {
    calls += 1;
    if (calls < 2) return { ok: false, status: 429, text: async () => JSON.stringify({ retry_after: 0 }) };
    return { ok: true, json: async () => ({ ok: 1 }) };
  });
  const res = await postWithRetry('u', {});
  assert.equal((await res.json()).ok, 1);
  assert.equal(calls, 2);
});

test('postWithRetry throws on non-429 error', async () => {
  __setFetch(async () => ({ ok: false, status: 422, text: async () => 'bad' }));
  await assert.rejects(() => postWithRetry('u', {}), /422/);
});

test('getJson returns parsed body and throws on non-ok', async () => {
  __setFetch(async () => ({ ok: true, json: async () => ({ status: 'processing' }) }));
  assert.equal((await getJson('u')).status, 'processing');
  __setFetch(async () => ({ ok: false, status: 500, text: async () => 'boom' }));
  await assert.rejects(() => getJson('u'), /500|boom/);
});

test('withSlot serializes to one at a time by default', async () => {
  process.env.REPLICATE_API_TOKEN = 'r8_test';
  delete process.env.REPLICATE_CONCURRENCY;
  let active = 0, max = 0;
  const job = () => withSlot(async () => {
    active += 1; max = Math.max(max, active);
    await new Promise((r) => setTimeout(r, 10));
    active -= 1;
  });
  await Promise.all([job(), job(), job()]);
  assert.equal(max, 1);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `node --test test/replicateClient.test.js`
Expected: FAIL (module missing).

- [ ] **Step 3: Create `src/replicateClient.js`**

Move the seams, limiter, backoff and retry out of `replicateProvider.js` into here, and add `replicateHeaders` + `getJson`:

```js
// Shared HTTP client for all Replicate-hosted providers (image + video):
// one fetch/sleep seam, one account-wide concurrency limiter, and 429 retry.

let _fetch = globalThis.fetch;
export function __setFetch(fn) { _fetch = fn; }

let _sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function __setSleep(fn) { _sleep = fn; }
export function sleep(ms) { return _sleep(ms); }

export function replicateHeaders(extra = {}) {
  return {
    'Authorization': `Bearer ${process.env.REPLICATE_API_TOKEN}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

const MAX_ATTEMPTS = 4;
const MAX_WAIT_MS = 15000;

function backoffMs(detail, res) {
  let seconds = 5;
  try {
    const parsed = JSON.parse(detail);
    if (Number.isFinite(parsed.retry_after)) seconds = parsed.retry_after;
  } catch { /* not JSON */ }
  const header = res.headers?.get?.('retry-after');
  if (header != null && !Number.isNaN(Number(header))) seconds = Number(header);
  return Math.min(seconds * 1000, MAX_WAIT_MS) + Math.floor(Math.random() * 400);
}

// --- account-wide concurrency limiter ("waiter") ---
let _active = 0;
const _queue = [];
function concurrencyLimit() {
  const n = Number(process.env.REPLICATE_CONCURRENCY);
  return Number.isInteger(n) && n > 0 ? n : 1;
}
function acquireSlot() {
  return new Promise((resolve) => {
    if (_active < concurrencyLimit()) { _active += 1; resolve(); }
    else { _queue.push(resolve); }
  });
}
function releaseSlot() {
  const next = _queue.shift();
  if (next) next();
  else _active -= 1;
}
export async function withSlot(fn) {
  await acquireSlot();
  try { return await fn(); }
  finally { releaseSlot(); }
}

// POST with retry on HTTP 429; any other non-ok throws. Returns ok Response.
export async function postWithRetry(url, options) {
  for (let attempt = 1; ; attempt++) {
    const res = await _fetch(url, options);
    if (res.ok) return res;
    const detail = await res.text();
    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      await _sleep(backoffMs(detail, res));
      continue;
    }
    throw new Error(`Replicate ${res.status}: ${detail.slice(0, 300)}`);
  }
}

// GET returning parsed JSON; throws on non-ok. Used for polling predictions.
export async function getJson(url) {
  const res = await _fetch(url, { headers: replicateHeaders() });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Replicate ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.json();
}
```

- [ ] **Step 4: Refactor `src/replicateProvider.js` to use the client**

Replace the whole file with:

```js
// Factory for Replicate-hosted IMAGE models. Uses the shared client for the
// fetch seam, concurrency limiter, and 429 retry. Each providers/replicate-*.js
// file is a thin config.
import { withSlot, postWithRetry, replicateHeaders } from './replicateClient.js';

// Re-export the seams so providers/replicate.js and existing tests can inject.
export { __setFetch, __setSleep } from './replicateClient.js';

export function makeReplicateProvider({ id, label, model, cost = 0, input = {} }) {
  return {
    id,
    label,
    cost,
    hasKey() { return !!process.env.REPLICATE_API_TOKEN; },
    async generate(prompt) {
      return withSlot(async () => {
        const started = Date.now();
        const res = await postWithRetry(
          `https://api.replicate.com/v1/models/${model}/predictions`,
          {
            method: 'POST',
            headers: replicateHeaders({ Prefer: 'wait' }),
            body: JSON.stringify({ input: { prompt, ...input } }),
          },
        );
        const data = await res.json();
        if (data.status !== 'succeeded') {
          const detail = typeof data.error === 'string' ? data.error : JSON.stringify(data.error || '');
          throw new Error(`Replicate prediction ${data.status}: ${detail}`);
        }
        const image = Array.isArray(data.output) ? data.output[0] : data.output;
        if (!image) throw new Error('Replicate returned no image');
        return { image, ms: Date.now() - started, cost };
      });
    },
  };
}
```

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS — `replicateClient.test.js` green AND the existing `replicate.test.js`, `replicateProvider.test.js`, `replicate-models.test.js` all still green (behavior unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/replicateClient.js src/replicateProvider.js test/replicateClient.test.js
git commit -m "refactor: extract shared Replicate HTTP client (no behavior change)"
```

---

### Task 4: Replicate video factory + video model configs

**Files:**
- Create: `src/replicateVideoProvider.js`
- Create: `providers/video-veo3.js`, `providers/video-kling.js`, `providers/video-wan.js`, `providers/video-hailuo.js`, `providers/video-ltx.js`, `providers/video-hunyuan.js`
- Test: `test/replicateVideoProvider.test.js`, `test/video-models.test.js`

**Interfaces:**
- Consumes: the client's `withSlot`, `postWithRetry`, `getJson`, `sleep`, `replicateHeaders`, `__setFetch`, `__setSleep`.
- Produces: `makeReplicateVideoProvider({ id, label, model, cost = 0, input = {}, timeoutMs = 600000, pollMs = 3000 })` → provider object `{ id, label, kind: 'video', cost, timeoutMs, hasKey(), generate(prompt) }`. `generate` creates a prediction (no `Prefer: wait`), polls the prediction's `urls.get` until terminal, and returns `{ video, type: 'video', ms, cost }`. Also re-exports `__setFetch`/`__setSleep` from the client.

- [ ] **Step 1: Create `test/replicateVideoProvider.test.js` (failing)**

```js
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
```

- [ ] **Step 2: Run to confirm failure**

Run: `node --test test/replicateVideoProvider.test.js`
Expected: FAIL (module missing).

- [ ] **Step 3: Create `src/replicateVideoProvider.js`**

```js
// Factory for Replicate-hosted VIDEO models. Video generation is async, so this
// creates a prediction (no Prefer: wait) and polls until it finishes. Reuses the
// shared client (fetch seam, account-wide concurrency limiter, 429 retry).
import { withSlot, postWithRetry, getJson, sleep, replicateHeaders } from './replicateClient.js';

export { __setFetch, __setSleep } from './replicateClient.js';

const TERMINAL_FAIL = new Set(['failed', 'canceled']);

export function makeReplicateVideoProvider({ id, label, model, cost = 0, input = {}, timeoutMs = 600000, pollMs = 3000 }) {
  return {
    id,
    label,
    kind: 'video',
    cost,
    timeoutMs,
    hasKey() { return !!process.env.REPLICATE_API_TOKEN; },
    async generate(prompt) {
      return withSlot(async () => {
        const started = Date.now();
        const res = await postWithRetry(
          `https://api.replicate.com/v1/models/${model}/predictions`,
          {
            method: 'POST',
            headers: replicateHeaders(),
            body: JSON.stringify({ input: { prompt, ...input } }),
          },
        );
        const created = await res.json();
        const getUrl = created?.urls?.get;
        if (!getUrl) throw new Error('Replicate did not return a prediction URL');

        const deadline = started + timeoutMs;
        // Poll until the prediction reaches a terminal state.
        for (;;) {
          const data = await getJson(getUrl);
          if (data.status === 'succeeded') {
            const video = Array.isArray(data.output) ? data.output[0] : data.output;
            if (!video) throw new Error('Replicate returned no video');
            return { video, type: 'video', ms: Date.now() - started, cost };
          }
          if (TERMINAL_FAIL.has(data.status)) {
            const detail = typeof data.error === 'string' ? data.error : JSON.stringify(data.error || '');
            throw new Error(`Replicate prediction ${data.status}: ${detail}`);
          }
          if (Date.now() > deadline) throw new Error('timed out waiting for video');
          await sleep(pollMs);
        }
      });
    },
  };
}
```

- [ ] **Step 4: Run to confirm the factory tests pass**

Run: `node --test test/replicateVideoProvider.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Create the six video config files**

`providers/video-veo3.js`:

```js
import { makeReplicateVideoProvider } from '../src/replicateVideoProvider.js';

export default makeReplicateVideoProvider({
  id: 'video-veo3', label: 'Google Veo-3 fast', model: 'google/veo-3-fast', cost: 2.5,
});
```

`providers/video-kling.js`:

```js
import { makeReplicateVideoProvider } from '../src/replicateVideoProvider.js';

export default makeReplicateVideoProvider({
  id: 'video-kling', label: 'Kling v2.1', model: 'kwaivgi/kling-v2.1', cost: 0.4,
});
```

`providers/video-wan.js`:

```js
import { makeReplicateVideoProvider } from '../src/replicateVideoProvider.js';

export default makeReplicateVideoProvider({
  id: 'video-wan', label: 'Wan 2.5 t2v fast', model: 'wan-video/wan-2.5-t2v-fast', cost: 0.2,
});
```

`providers/video-hailuo.js`:

```js
import { makeReplicateVideoProvider } from '../src/replicateVideoProvider.js';

export default makeReplicateVideoProvider({
  id: 'video-hailuo', label: 'Minimax Hailuo-02', model: 'minimax/hailuo-02', cost: 0.4,
});
```

`providers/video-ltx.js`:

```js
import { makeReplicateVideoProvider } from '../src/replicateVideoProvider.js';

export default makeReplicateVideoProvider({
  id: 'video-ltx', label: 'LTX-video', model: 'lightricks/ltx-video', cost: 0.1,
});
```

`providers/video-hunyuan.js`:

```js
import { makeReplicateVideoProvider } from '../src/replicateVideoProvider.js';

export default makeReplicateVideoProvider({
  id: 'video-hunyuan', label: 'Hunyuan-video', model: 'tencent/hunyuan-video', cost: 0.3,
});
```

- [ ] **Step 6: Create `test/video-models.test.js`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { __setFetch, __setSleep } from '../src/replicateVideoProvider.js';
import veo3 from '../providers/video-veo3.js';
import kling from '../providers/video-kling.js';
import wan from '../providers/video-wan.js';
import hailuo from '../providers/video-hailuo.js';
import ltx from '../providers/video-ltx.js';
import hunyuan from '../providers/video-hunyuan.js';

__setSleep(async () => {});

const cases = [
  { p: veo3, id: 'video-veo3', slug: 'google/veo-3-fast' },
  { p: kling, id: 'video-kling', slug: 'kwaivgi/kling-v2.1' },
  { p: wan, id: 'video-wan', slug: 'wan-video/wan-2.5-t2v-fast' },
  { p: hailuo, id: 'video-hailuo', slug: 'minimax/hailuo-02' },
  { p: ltx, id: 'video-ltx', slug: 'lightricks/ltx-video' },
  { p: hunyuan, id: 'video-hunyuan', slug: 'tencent/hunyuan-video' },
];

for (const c of cases) {
  test(`${c.id}: video kind and creates prediction at ${c.slug}`, async () => {
    assert.equal(c.p.kind, 'video');
    assert.ok(c.p.cost > 0);
    process.env.REPLICATE_API_TOKEN = 'r8_test';
    __setFetch(async (url, opts) => {
      if (opts && opts.method === 'POST') {
        assert.equal(url, `https://api.replicate.com/v1/models/${c.slug}/predictions`);
        return { ok: true, json: async () => ({ id: 'p', status: 'starting', urls: { get: 'g' } }) };
      }
      return { ok: true, json: async () => ({ status: 'succeeded', output: 'https://r/clip.mp4' }) };
    });
    const out = await c.p.generate('a frog');
    assert.equal(out.type, 'video');
    assert.equal(out.video, 'https://r/clip.mp4');
  });
}
```

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: PASS — video factory + routing tests green, all prior tests green.

- [ ] **Step 8: Commit**

```bash
git add src/replicateVideoProvider.js providers/video-*.js test/replicateVideoProvider.test.js test/video-models.test.js
git commit -m "feat: add Replicate video factory and six video model configs"
```

---

### Task 5: OpenAI Sora video provider

**Files:**
- Create: `src/soraProvider.js`
- Create: `providers/sora-2.js`, `providers/sora-2-pro.js`
- Test: `test/soraProvider.test.js`

**Interfaces:**
- Consumes: `process.env.OPENAI_API_KEY`.
- Produces: `makeSoraProvider({ id, label, model, cost = 0, seconds = '4', size = '720x1280', timeoutMs = 600000, pollMs = 3000 })` → `{ id, label, kind: 'video', cost, timeoutMs, hasKey(), generate(prompt) }`. `generate` POSTs to the OpenAI videos endpoint to create a job, polls `GET /v1/videos/{id}` until `status` is `completed`, downloads `GET /v1/videos/{id}/content`, and returns `{ video: <data:video/mp4;base64,…>, type: 'video', ms, cost }`. Exposes `__setFetch`/`__setSleep`. **Note:** OpenAI's video API is new; this is written to the documented shape and may need a small live tweak.

- [ ] **Step 1: Create `test/soraProvider.test.js` (failing)**

```js
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
```

- [ ] **Step 2: Run to confirm failure**

Run: `node --test test/soraProvider.test.js`
Expected: FAIL (module missing).

- [ ] **Step 3: Create `src/soraProvider.js`**

```js
// Factory for OpenAI Sora video models. Sora generation is async: create a
// video job, poll until completed, then download the mp4 and return it as a
// data URL the browser can play directly. OpenAI's video API is new — if a live
// run 4xx's, the create/poll/content shapes here are the things to adjust.
let _fetch = globalThis.fetch;
export function __setFetch(fn) { _fetch = fn; }
let _sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function __setSleep(fn) { _sleep = fn; }

const BASE = 'https://api.openai.com/v1/videos';
const TERMINAL_FAIL = new Set(['failed', 'cancelled', 'canceled', 'error']);

function authHeaders() {
  return {
    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function asJson(res, where) {
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI ${where} ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.json();
}

export function makeSoraProvider({ id, label, model, cost = 0, seconds = '4', size = '720x1280', timeoutMs = 600000, pollMs = 3000 }) {
  return {
    id,
    label,
    kind: 'video',
    cost,
    timeoutMs,
    hasKey() { return !!process.env.OPENAI_API_KEY; },
    async generate(prompt) {
      const started = Date.now();
      const createRes = await _fetch(BASE, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ model, prompt, seconds, size }),
      });
      const job = await asJson(createRes, 'create');
      const jobId = job.id;
      if (!jobId) throw new Error('OpenAI did not return a video job id');

      const deadline = started + timeoutMs;
      for (;;) {
        const statusRes = await _fetch(`${BASE}/${jobId}`, { headers: authHeaders() });
        const data = await asJson(statusRes, 'status');
        if (data.status === 'completed') break;
        if (TERMINAL_FAIL.has(data.status)) {
          const msg = data.error?.message || data.error || data.status;
          throw new Error(`OpenAI video ${data.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
        }
        if (Date.now() > deadline) throw new Error('timed out waiting for video');
        await _sleep(pollMs);
      }

      const contentRes = await _fetch(`${BASE}/${jobId}/content`, { headers: authHeaders() });
      if (!contentRes.ok) {
        const detail = await contentRes.text();
        throw new Error(`OpenAI content ${contentRes.status}: ${detail.slice(0, 300)}`);
      }
      const buf = Buffer.from(await contentRes.arrayBuffer());
      return {
        video: `data:video/mp4;base64,${buf.toString('base64')}`,
        type: 'video',
        ms: Date.now() - started,
        cost,
      };
    },
  };
}
```

- [ ] **Step 4: Run to confirm the factory tests pass**

Run: `node --test test/soraProvider.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Create the two Sora config files**

`providers/sora-2.js`:

```js
import { makeSoraProvider } from '../src/soraProvider.js';

export default makeSoraProvider({
  id: 'sora-2', label: 'OpenAI Sora-2', model: 'sora-2', cost: 1.0,
});
```

`providers/sora-2-pro.js`:

```js
import { makeSoraProvider } from '../src/soraProvider.js';

export default makeSoraProvider({
  id: 'sora-2-pro', label: 'OpenAI Sora-2 pro', model: 'sora-2-pro', cost: 2.0,
});
```

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS — Sora tests green, all prior tests green.

- [ ] **Step 7: Commit**

```bash
git add src/soraProvider.js providers/sora-2.js providers/sora-2-pro.js test/soraProvider.test.js
git commit -m "feat: add OpenAI Sora video provider (create + poll + content)"
```

---

### Task 6: Frontend — model selection, cost estimate, video tiles

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/style.css`

**Interfaces:**
- Consumes: `GET /api/providers` (now `{ id, label, kind, cost, status }`) and `POST /api/generate { prompt, ids }` (results may have `type:'video'` + `video`).
- Produces: a UI where each tile has a checkbox (image checked, video unchecked by default), a live estimated-cost line, and video results rendered with `<video controls>`. No automated test — verified via the manual checklist.

- [ ] **Step 1: Add the estimate line to `public/index.html`**

Replace the `<p id="status" …>` line's surrounding area so there is an estimate element. Change:

```html
      <p id="status" class="status"></p>
```

to:

```html
      <p id="estimate" class="status"></p>
      <p id="status" class="status"></p>
```

- [ ] **Step 2: Replace `public/app.js`**

```js
const form = document.getElementById('prompt-form');
const promptEl = document.getElementById('prompt');
const goBtn = document.getElementById('go');
const statusEl = document.getElementById('status');
const estimateEl = document.getElementById('estimate');
const grid = document.getElementById('grid');

const tiles = new Map();     // id -> tile element
const meta = new Map();      // id -> { kind, cost, status }

function tile(id, label) {
  let el = tiles.get(id);
  if (!el) {
    el = document.createElement('div');
    el.className = 'tile';
    el.innerHTML = `
      <div class="imgwrap"></div>
      <div class="meta">
        <div class="label">
          <label class="pick"><input type="checkbox" class="run" /> <span class="name"></span></label>
          <button class="star" title="favorite">★</button>
        </div>
        <div class="sub"></div>
      </div>`;
    el.querySelector('.star').addEventListener('click', (e) => e.currentTarget.classList.toggle('on'));
    el.querySelector('.run').addEventListener('change', updateEstimate);
    grid.appendChild(el);
    tiles.set(id, el);
  }
  el.querySelector('.name').textContent = label;
  return el;
}

function selectedIds() {
  const ids = [];
  for (const [id, el] of tiles) {
    if (el.querySelector('.run').checked) ids.push(id);
  }
  return ids;
}

function updateEstimate() {
  let total = 0;
  for (const id of selectedIds()) total += (meta.get(id)?.cost || 0);
  const n = selectedIds().length;
  estimateEl.textContent = `Estimated: $${total.toFixed(3)} for ${n} selected model${n === 1 ? '' : 's'}`;
}

function render(id, label, state) {
  const el = tile(id, label);
  const wrap = el.querySelector('.imgwrap');
  const sub = el.querySelector('.sub');
  // keep the checkbox state class separate from the status class
  el.className = `tile ${state.status}`;
  wrap.querySelectorAll('img,video').forEach((n) => n.remove());
  el.removeAttribute('data-error');
  if (state.status === 'done') {
    if (state.type === 'video' && state.video) {
      const v = document.createElement('video');
      v.src = state.video; v.controls = true; v.loop = true; v.muted = true; v.playsInline = true;
      wrap.appendChild(v);
    } else {
      const img = document.createElement('img');
      img.src = state.image; img.alt = label;
      wrap.appendChild(img);
    }
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
  meta.clear();
  for (const p of providers) {
    meta.set(p.id, { kind: p.kind, cost: p.cost, status: p.status });
    render(p.id, p.label, { status: p.status });
    const el = tiles.get(p.id);
    const box = el.querySelector('.run');
    box.disabled = p.status !== 'ready';
    // default: image models checked, video models unchecked
    box.checked = p.status === 'ready' && p.kind !== 'video';
    const costLabel = p.cost ? ` · ~$${Number(p.cost).toFixed(3)}` : '';
    el.querySelector('.sub').textContent =
      (p.status === 'no_key' ? 'add key in .env to enable' : (p.kind === 'video' ? 'video' : 'image')) + costLabel;
  }
  updateEstimate();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const prompt = promptEl.value.trim();
  if (!prompt) return;
  const ids = selectedIds();
  if (!ids.length) { statusEl.textContent = 'Select at least one model.'; return; }
  goBtn.disabled = true;
  statusEl.textContent = 'Generating…';
  for (const id of ids) {
    render(id, tiles.get(id).querySelector('.name').textContent, { status: 'loading' });
  }
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, ids }),
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

- [ ] **Step 3: Add styles to `public/style.css`**

Append:

```css
.tile video { width: 100%; height: 100%; object-fit: cover; }
.pick { display: flex; align-items: center; gap: 6px; cursor: pointer; }
.pick input { cursor: pointer; }
#estimate { color: #8fd6a0; font-weight: 600; }
.tile.loading .imgwrap::after { content: "generating…"; color: #9aa0aa; }
```

- [ ] **Step 4: Manual verification**

Run: `OPENAI_API_KEY= REPLICATE_API_TOKEN= node server.js &` then:
- `curl -s http://localhost:3000/` → contains `id="estimate"`.
- `curl -s http://localhost:3000/app.js | grep -c selectedIds` → ≥ 1.
- `curl -s http://localhost:3000/api/providers` → entries have `kind` and `cost`.
Kill the server. Then run `npm test` to confirm the backend suite is still green (frontend has no automated test).

With real keys, open `http://localhost:3000`:
- [ ] Image tiles are checked, video tiles unchecked; estimate line shows only image cost.
- [ ] Checking a video model updates the estimate.
- [ ] Generating with only image models behaves exactly as before.
- [ ] A checked video model shows "generating…" then a playable `<video>`.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/app.js public/style.css
git commit -m "feat: model selection checkboxes, cost estimate, and video tiles"
```

---

### Task 7: Docs — README video section

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above. Docs only, no test.

- [ ] **Step 1: Update the tagline and add a Video section to `README.md`**

Change the tagline line:

```markdown
**Type one prompt, watch AI image _and video_ models generate it side by side.**
```

Add a new section after the "Models included" table:

```markdown
## 🎬 Video models (opt-in)

The arena also compares **text-to-video** models. Because video is slow (minutes)
and expensive (dollars per clip), every video model is **opt-in**:

- Each model tile has a checkbox. **Video models are unchecked by default**; only
  checked models run.
- A live **estimated-cost** line shows the total for your current selection before
  you hit Generate.

| Model | Provider | Key |
|---|---|---|
| OpenAI Sora-2 / Sora-2 pro | OpenAI | `OPENAI_API_KEY` |
| Google Veo-3 fast | Replicate | `REPLICATE_API_TOKEN` |
| Kling v2.1 | Replicate | `REPLICATE_API_TOKEN` |
| Wan 2.5 t2v fast | Replicate | `REPLICATE_API_TOKEN` |
| Minimax Hailuo-02 | Replicate | `REPLICATE_API_TOKEN` |
| LTX-video | Replicate | `REPLICATE_API_TOKEN` |
| Hunyuan-video | Replicate | `REPLICATE_API_TOKEN` |

> Costs shown in the UI are rough estimates for budgeting — a single Sora or Veo
> clip can cost a few dollars. Verify against current provider pricing.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document opt-in video models"
```

---

## Self-Review Notes

- **Spec coverage:** opt-in selection (Task 2 `ids` + Task 6 checkboxes) ✓; video unchecked by default (Task 6) ✓; live cost estimate (Task 2 `cost` in API + Task 6 estimate line) ✓; `<video>` tiles (Task 6) ✓; video providers pluggable (Tasks 4/5) ✓; async create+poll (Tasks 4/5) ✓; per-provider timeout (Task 1) ✓; images untouched / additive (Tasks 1–3 keep image tests green) ✓; all HTTP mocked + sleep injected (Tasks 3/4/5) ✓; Sora flagged as needs-live-check (Task 5) ✓; README (Task 7) ✓.
- **Images-green guarantee:** Task 1 adds fields without removing any; Task 2 adds `cost` to provider objects and an optional `ids` param (default runs all); Task 3 is a pure refactor that re-exports the same seams. Each task ends with `npm test` requiring all prior tests green.
- **Type consistency:** provider result `{ image | video, type, ms, cost }`; provider object `{ id, label, kind?, cost?, timeoutMs?, hasKey, generate }`; `runOne` done-result `{ id, label, status, type, image, video, ms, cost }`; API list item `{ id, label, kind, cost, status }`. Client exports (`withSlot`, `postWithRetry`, `getJson`, `sleep`, `replicateHeaders`, `__setFetch`, `__setSleep`) are used identically in Tasks 3/4. Frontend reads exactly `id, label, kind, cost, status` and result `type/video/image/ms/cost/error`.
- **Deferred (YAGNI):** per-model duration/resolution UI, saved-run gallery, server-side proxy for Sora (data URL used instead).
