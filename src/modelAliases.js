// Friendly aliases → real provider ids, and the reverse for display.
export const MODEL_ALIASES = { 'gpt-image-1': 'openai', 'gpt-image-2': 'openai-gpt-image-2' };
const REVERSE = Object.fromEntries(Object.entries(MODEL_ALIASES).map(([alias, id]) => [id, alias]));
export function resolveModel(name) { return MODEL_ALIASES[name] ?? name; }
export function displayModel(id) { return REVERSE[id] ?? id; }
