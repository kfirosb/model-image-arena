// Shared factory for OpenAI image models. All of them use the same
// images/generations endpoint and return base64 image data, differing only by
// model id / label / cost — so the request logic lives here once, and each
// providers/openai*.js file is a thin config.

// Allow tests to inject a fake fetch; default to global fetch.
let _fetch = globalThis.fetch;
export function __setFetch(fn) { _fetch = fn; }

// Build a provider object matching the app's provider contract.
// opts: { id, label, model, cost = 0, size = '1024x1024' }
export function makeOpenAIProvider({ id, label, model, cost = 0, size = '1024x1024' }) {
  return {
    id,
    label,
    cost,
    hasKey() { return !!process.env.OPENAI_API_KEY; },
    async generate(prompt) {
      const started = Date.now();
      const res = await _fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, prompt, n: 1, size }),
      });
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`OpenAI ${res.status}: ${detail.slice(0, 300)}`);
      }
      const data = await res.json();
      const b64 = data?.data?.[0]?.b64_json;
      if (!b64) throw new Error('OpenAI returned no image data');
      return {
        image: `data:image/png;base64,${b64}`,
        ms: Date.now() - started,
        cost,
      };
    },
  };
}
