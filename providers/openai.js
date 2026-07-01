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
