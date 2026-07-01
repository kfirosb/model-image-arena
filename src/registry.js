import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadProviders(dir) {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.js'));
  const providers = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(join(dir, file)).href);
    if (mod.default && mod.default.id) providers.push(mod.default);
  }
  providers.sort((a, b) => a.id.localeCompare(b.id));
  return providers;
}
