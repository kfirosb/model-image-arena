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
