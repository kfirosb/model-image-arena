import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadProviders } from './registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROVIDERS_DIR = join(__dirname, '..', 'providers');

// Test seam for the https-download path; real fetch by default.
let _fetch = globalThis.fetch;
export function __setFetch(fn) { _fetch = fn; }

// Best-effort mapping from a model id to the env var it needs, for a precise
// "set X" error. Providers are not changed to expose this.
function envForModel(id) {
  if (/^(gpt-image|openai)/.test(id)) return 'OPENAI_API_KEY';
  if (/^replicate/.test(id)) return 'REPLICATE_API_TOKEN';
  return null;
}

// Turn a provider's `image` (data: URL or https URL) into raw bytes.
async function toBuffer(image) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(image);
  if (m) return { buffer: Buffer.from(m[2], 'base64'), mime: m[1] };
  const res = await _fetch(image);
  if (!res.ok) throw new Error(`failed to download image (${res.status})`);
  const mime = res.headers?.get?.('content-type') || 'image/png';
  return { buffer: Buffer.from(await res.arrayBuffer()), mime };
}

export async function generateImage({ model, prompt, providersDir = DEFAULT_PROVIDERS_DIR }) {
  const providers = await loadProviders(providersDir);
  const provider = providers.find((p) => p.id === model);
  if (!provider) {
    const ids = providers.filter((p) => (p.kind ?? 'image') !== 'video').map((p) => p.id);
    throw new Error(`Unknown model "${model}". Available: ${ids.join(', ')}`);
  }
  if ((provider.kind ?? 'image') === 'video') {
    throw new Error(`"${model}" is a video model; genimage is image-only`);
  }
  if (!provider.hasKey()) {
    const env = envForModel(model);
    throw new Error(`No API key for "${model}". Set ${env || 'its API key'} in .env`);
  }
  const result = await provider.generate(prompt);
  const { buffer, mime } = await toBuffer(result.image);
  return { buffer, mime, ms: result.ms ?? null, cost: result.cost ?? 0 };
}
