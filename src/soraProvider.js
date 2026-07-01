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
