import test from 'node:test';
import assert from 'node:assert/strict';
import { __setFetch } from '../src/openaiProvider.js';
import gptImage1 from '../providers/openai.js';
import gptImage2 from '../providers/openai-gpt-image-2.js';

// Each config file must send the right `model` and map the response to a data URL.
const cases = [
  { p: gptImage1, id: 'openai', label: 'OpenAI gpt-image-1', model: 'gpt-image-1' },
  { p: gptImage2, id: 'openai-gpt-image-2', label: 'OpenAI gpt-image-2', model: 'gpt-image-2' },
];

for (const c of cases) {
  test(`${c.id}: id/label match and generate requests model "${c.model}"`, async () => {
    assert.equal(c.p.id, c.id);
    assert.equal(c.p.label, c.label);
    process.env.OPENAI_API_KEY = 'sk-test';
    __setFetch(async (url, opts) => {
      assert.match(url, /images\/generations/);
      const body = JSON.parse(opts.body);
      assert.equal(body.model, c.model);
      assert.equal(body.prompt, 'a frog');
      return { ok: true, json: async () => ({ data: [{ b64_json: 'QUJD' }] }) };
    });
    const out = await c.p.generate('a frog');
    assert.equal(out.image, 'data:image/png;base64,QUJD');
    assert.ok(out.cost > 0);
  });
}
