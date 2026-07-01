import test from 'node:test';
import assert from 'node:assert/strict';
import { __setFetch, __setSleep } from '../src/replicateVideoProvider.js';
import veo3 from '../providers/video-veo3.js';
import kling from '../providers/video-kling.js';
import wan from '../providers/video-wan.js';
import hailuo from '../providers/video-hailuo.js';
import ltx from '../providers/video-ltx.js';
import hunyuan from '../providers/video-hunyuan.js';

__setSleep(async () => {});

const cases = [
  { p: veo3, id: 'video-veo3', slug: 'google/veo-3-fast' },
  { p: kling, id: 'video-kling', slug: 'kwaivgi/kling-v2.1' },
  { p: wan, id: 'video-wan', slug: 'wan-video/wan-2.5-t2v-fast' },
  { p: hailuo, id: 'video-hailuo', slug: 'minimax/hailuo-02' },
  { p: ltx, id: 'video-ltx', slug: 'lightricks/ltx-video' },
  { p: hunyuan, id: 'video-hunyuan', slug: 'tencent/hunyuan-video' },
];

for (const c of cases) {
  test(`${c.id}: video kind and creates prediction at ${c.slug}`, async () => {
    assert.equal(c.p.kind, 'video');
    assert.ok(c.p.cost > 0);
    process.env.REPLICATE_API_TOKEN = 'r8_test';
    __setFetch(async (url, opts) => {
      if (opts && opts.method === 'POST') {
        assert.equal(url, `https://api.replicate.com/v1/models/${c.slug}/predictions`);
        return { ok: true, json: async () => ({ id: 'p', status: 'starting', urls: { get: 'g' } }) };
      }
      return { ok: true, json: async () => ({ status: 'succeeded', output: 'https://r/clip.mp4' }) };
    });
    const out = await c.p.generate('a frog');
    assert.equal(out.type, 'video');
    assert.equal(out.video, 'https://r/clip.mp4');
  });
}
