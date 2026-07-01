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
