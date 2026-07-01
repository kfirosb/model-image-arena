import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadProviders } from '../src/registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures', 'providers');

test('loadProviders imports every file and sorts by id', async () => {
  const providers = await loadProviders(fixturesDir);
  assert.equal(providers.length, 2);
  assert.deepEqual(providers.map((p) => p.id), ['good', 'nokey']);
  assert.equal(typeof providers[0].generate, 'function');
  assert.equal(providers[0].hasKey(), true);
  assert.equal(providers[1].hasKey(), false);
});
