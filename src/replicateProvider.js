// Shared factory for Replicate-hosted image models. Every Replicate provider
// calls the same synchronous predictions endpoint (`Prefer: wait`) and differs
// only by model slug / label / cost / extra input — so the request logic lives
// here once, and each providers/replicate-*.js file is a thin config.

// Allow tests to inject a fake fetch; default to global fetch.
let _fetch = globalThis.fetch;
export function __setFetch(fn) { _fetch = fn; }

// Allow tests to inject a fast sleep; default to real setTimeout.
let _sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function __setSleep(fn) { _sleep = fn; }

const MAX_ATTEMPTS = 4;   // initial try + up to 3 retries on throttle
const MAX_WAIT_MS = 15000; // cap a single backoff wait so runOne's 60s timeout holds

// How long to wait after a 429, from the response body's `retry_after`
// (seconds) or a `Retry-After` header, defaulting to 5s. Small jitter avoids
// several throttled models retrying in lockstep.
function backoffMs(status, detail, res) {
  let seconds = 5;
  try {
    const parsed = JSON.parse(detail);
    if (Number.isFinite(parsed.retry_after)) seconds = parsed.retry_after;
  } catch { /* detail wasn't JSON */ }
  const header = res.headers?.get?.('retry-after');
  if (header != null && !Number.isNaN(Number(header))) seconds = Number(header);
  return Math.min(seconds * 1000, MAX_WAIT_MS) + Math.floor(Math.random() * 400);
}

// --- Concurrency limiter ("waiter") ---------------------------------------
// Replicate throttles to a burst of 1 while an account is under the paid-credit
// threshold, so firing all models at once gets most of them rejected. This
// semaphore sends Replicate requests one at a time by default. Raise the limit
// with REPLICATE_CONCURRENCY once you have enough credit to run them in parallel.
let _active = 0;
const _queue = [];

function concurrencyLimit() {
  const n = Number(process.env.REPLICATE_CONCURRENCY);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

function acquireSlot() {
  return new Promise((resolve) => {
    if (_active < concurrencyLimit()) {
      _active += 1;
      resolve();
    } else {
      _queue.push(resolve);
    }
  });
}

function releaseSlot() {
  const next = _queue.shift();
  if (next) {
    next(); // hand the slot straight to the next waiter (keeps _active steady)
  } else {
    _active -= 1;
  }
}

// Run fn while holding a slot, so no more than `concurrencyLimit()` Replicate
// requests are in flight at once. Always releases, even if fn throws.
async function withSlot(fn) {
  await acquireSlot();
  try {
    return await fn();
  } finally {
    releaseSlot();
  }
}

// POST with automatic retry on HTTP 429 (throttling). Any other non-ok status
// throws immediately. Returns the ok Response.
async function postWithRetry(url, options) {
  for (let attempt = 1; ; attempt++) {
    const res = await _fetch(url, options);
    if (res.ok) return res;
    const detail = await res.text();
    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      await _sleep(backoffMs(res.status, detail, res));
      continue;
    }
    throw new Error(`Replicate ${res.status}: ${detail.slice(0, 300)}`);
  }
}

// Build a provider object matching the app's provider contract.
// opts: { id, label, model, cost = 0, input = {} }
//   model: Replicate "owner/name" slug (must be an official/runnable model)
//   cost:  rough USD-per-image estimate for display
//   input: extra model-specific input fields merged alongside { prompt }
export function makeReplicateProvider({ id, label, model, cost = 0, input = {} }) {
  return {
    id,
    label,
    hasKey() { return !!process.env.REPLICATE_API_TOKEN; },
    async generate(prompt) {
      return withSlot(async () => {
        const started = Date.now();
        const res = await postWithRetry(
          `https://api.replicate.com/v1/models/${model}/predictions`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.REPLICATE_API_TOKEN}`,
              'Content-Type': 'application/json',
              'Prefer': 'wait',
            },
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
