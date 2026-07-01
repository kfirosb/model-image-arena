// Allow tests to inject a fake fetch; default to global fetch.
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
      const detail = typeof data.error === 'string' ? data.error : JSON.stringify(data.error || '');
      throw new Error(`Replicate prediction ${data.status}: ${detail}`);
    }
    const image = Array.isArray(data.output) ? data.output[0] : data.output;
    if (!image) throw new Error('Replicate returned no image');
    return { image, ms: Date.now() - started, cost: COST_PER_IMAGE };
  },
};
