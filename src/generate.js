import { runOne } from './runProvider.js';

export function generateAll(providers, prompt) {
  return Promise.all(providers.map((p) => runOne(p, prompt)));
}

export function listProviders(providers) {
  return providers.map((p) => ({
    id: p.id,
    label: p.label,
    status: p.hasKey() ? 'ready' : 'no_key',
  }));
}
