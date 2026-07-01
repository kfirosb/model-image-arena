import { runOne } from './runProvider.js';

export function generateAll(providers, prompt, ids) {
  const selected = Array.isArray(ids) && ids.length
    ? providers.filter((p) => ids.includes(p.id))
    : providers;
  return Promise.all(selected.map((p) => runOne(p, prompt)));
}

export function listProviders(providers) {
  return providers.map((p) => ({
    id: p.id,
    label: p.label,
    kind: p.kind ?? 'image',
    cost: p.cost ?? 0,
    status: p.hasKey() ? 'ready' : 'no_key',
  }));
}
