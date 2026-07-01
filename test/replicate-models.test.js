import test from 'node:test';
import assert from 'node:assert/strict';
import { __setFetch } from '../src/replicateProvider.js';
import fluxPro from '../providers/replicate-flux-pro.js';
import imagen from '../providers/replicate-imagen.js';
import ideogram from '../providers/replicate-ideogram.js';

// Each config file must route to the right model slug and carry sane metadata.
const cases = [
  { p: fluxPro, id: 'replicate-flux-pro', label: 'Replicate FLUX 1.1 pro', slug: 'black-forest-labs/flux-1.1-pro' },
  { p: imagen, id: 'replicate-imagen', label: 'Google Imagen 4 (fast)', slug: 'google/imagen-4-fast' },
  { p: ideogram, id: 'replicate-ideogram', label: 'Ideogram v3 turbo', slug: 'ideogram-ai/ideogram-v3-turbo' },
];

for (const c of cases) {
  test(`${c.id}: id/label match and generate targets ${c.slug}`, async () => {
    assert.equal(c.p.id, c.id);
    assert.equal(c.p.label, c.label);
    process.env.REPLICATE_API_TOKEN = 'r8_test';
    __setFetch(async (url, opts) => {
      assert.equal(url, `https://api.replicate.com/v1/models/${c.slug}/predictions`);
      const body = JSON.parse(opts.body);
      assert.equal(body.input.prompt, 'a frog');
      return { ok: true, json: async () => ({ status: 'succeeded', output: ['https://r/img.png'] }) };
    });
    const out = await c.p.generate('a frog');
    assert.equal(out.image, 'https://r/img.png');
    assert.ok(out.cost > 0);
  });
}
