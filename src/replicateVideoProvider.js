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
