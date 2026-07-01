# 🏟️ Model Image Arena

**Type one prompt, watch AI image _and video_ models generate it side by side.**

Model Image Arena is a tiny local web app that sends the same prompt to several
text-to-image models **in parallel** and shows every result in one grid — with
generation time and estimated cost per model — so you can quickly judge which
model is best for your project.

![MIT License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D20.6-brightgreen)
![Tests](https://img.shields.io/badge/tests-61%20passing-brightgreen)

<!-- Tip: add a screenshot of a run by saving a PNG to docs/screenshot.png and
     adding:  ![Screenshot](docs/screenshot.png)  right here. -->

---

## ✨ Features

- **Parallel bake-off** — one prompt fans out to every configured model at once.
- **Side-by-side grid** — image, model name, time, and cost per tile, plus a ★ to favorite.
- **Pluggable models** — add a model by dropping one file in `providers/`. It's auto-discovered.
- **Bring only the keys you have** — models without an API key are greyed out, never called.
- **Throttle-aware** — Replicate requests are sent one at a time with automatic retry/back-off, so low-credit accounts still work.
- **No build step, no database, no accounts** — plain Node + Express + vanilla JS. Runs entirely on your machine.
- **Your keys stay local** — read from a gitignored `.env`, never sent to the browser.

## 🤖 Models included

| Model | Provider | Key needed |
|---|---|---|
| OpenAI gpt-image-1 | OpenAI | `OPENAI_API_KEY` |
| OpenAI gpt-image-2 | OpenAI | `OPENAI_API_KEY` |
| FLUX schnell | Replicate | `REPLICATE_API_TOKEN` |
| FLUX 1.1 pro | Replicate | `REPLICATE_API_TOKEN` |
| Google Imagen 4 (fast) | Replicate | `REPLICATE_API_TOKEN` |
| Ideogram v3 turbo | Replicate | `REPLICATE_API_TOKEN` |

> One Replicate token unlocks all four Replicate-hosted models. Add more models
> (Stable Diffusion, Recraft, Seedream, …) with a few lines — see
> [Adding a model](#-adding-a-model).

## 🎬 Video models (opt-in)

The arena also compares **text-to-video** models. Because video is slow (minutes)
and expensive (dollars per clip), every video model is **opt-in**:

- Each model tile has a checkbox. **Video models are unchecked by default**; only
  checked models run.
- A live **estimated-cost** line shows the total for your current selection before
  you hit Generate.

| Model | Provider | Key |
|---|---|---|
| OpenAI Sora-2 / Sora-2 pro | OpenAI | `OPENAI_API_KEY` |
| Google Veo-3 fast | Replicate | `REPLICATE_API_TOKEN` |
| Kling v2.1 | Replicate | `REPLICATE_API_TOKEN` |
| Wan 2.5 t2v fast | Replicate | `REPLICATE_API_TOKEN` |
| Minimax Hailuo-02 | Replicate | `REPLICATE_API_TOKEN` |
| LTX-video | Replicate | `REPLICATE_API_TOKEN` |
| Hunyuan-video | Replicate | `REPLICATE_API_TOKEN` |

> Costs shown in the UI are rough estimates for budgeting — a single Sora or Veo
> clip can cost a few dollars. Verify against current provider pricing.

## 🚀 Quick start

Requires **Node.js 20.6+**.

```bash
git clone <your-repo-url>
cd model-image-arena
npm install
cp .env.example .env      # then paste in the keys you have
npm start                 # open http://localhost:3000
```

Type a prompt (e.g. `a frog`), hit **Generate**, and compare.

Get keys here:
- **OpenAI** — https://platform.openai.com/api-keys
- **Replicate** — https://replicate.com/account/api-tokens

Only providers whose key is set will run; the rest show a greyed-out
"no API key" tile until you add their key.

## ⚙️ Configuration

All configuration lives in `.env` (copied from `.env.example`):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the local web server listens on |
| `OPENAI_API_KEY` | — | Enables the OpenAI model |
| `REPLICATE_API_TOKEN` | — | Enables all four Replicate models |
| `REPLICATE_CONCURRENCY` | `1` | How many Replicate requests run at once. Keep at `1` on low-credit accounts to avoid throttling; raise (e.g. `4`) once you have enough credit to run them in parallel. A running video prediction holds a slot for its full (minutes-long) duration, so if you select a video model, consider raising this. |

## 💸 A note on cost & rate limits

This tool calls **paid** APIs — each generation costs real money (typically a
few cents per image). Testing a prompt across all six image models is roughly
**$0.10–0.15** total.

Replicate throttles accounts under a credit threshold to a "burst of 1"
request. Model Image Arena handles this automatically by sending Replicate
requests one at a time and retrying on `429`, so everything still succeeds —
just a bit slower. Add credit and raise `REPLICATE_CONCURRENCY` for full-speed
parallel runs.

## 🧩 How it works

```
Browser (index.html + app.js)
      │  POST /api/generate { prompt }
      ▼
Express server (server.js)
      │  run every keyed provider in parallel (Promise.all)
      ├─ providers/openai.js               (gpt-image-1)
      ├─ providers/openai-gpt-image-2.js   (gpt-image-2)
      ├─ providers/replicate.js          (FLUX schnell)
      ├─ providers/replicate-flux-pro.js
      ├─ providers/replicate-imagen.js
      ├─ providers/replicate-ideogram.js
      ├─ providers/video-*.js              (Veo-3, Kling, Wan, Hailuo, LTX, Hunyuan — poll)
      └─ providers/sora-2.js / sora-2-pro.js (OpenAI Sora — poll)
      ▼
returns [{ id, label, status, image, ms, cost }]
```

- `src/registry.js` auto-discovers every file in `providers/`.
- `src/runProvider.js` runs one provider with a timeout and **never throws**, so
  one slow or failing model can't break the others.
- `src/replicateProvider.js` is a shared factory (retry + concurrency limiter)
  so each Replicate model is a ~7-line config file.

## 🧩 Adding a model

Drop a file in `providers/` — it's picked up automatically on the next request.

```js
// providers/mymodel.js
export default {
  id: 'mymodel',
  label: 'My Model',
  hasKey() { return !!process.env.MYMODEL_KEY; },
  async generate(prompt) {
    // ...call your API...
    return {
      image: 'https://…',   // an https URL or a data:image/…;base64,… URL
      ms: 1234,             // generation time in milliseconds
      cost: 0.01,           // estimated USD (0 if unknown)
    };
  },
};
```

Then add `MYMODEL_KEY` to your `.env`. For another Replicate-hosted model, reuse
the factory:

```js
// providers/replicate-sdxl.js
import { makeReplicateProvider } from '../src/replicateProvider.js';

export default makeReplicateProvider({
  id: 'replicate-sdxl',
  label: 'SDXL',
  model: 'stability-ai/sdxl',
  cost: 0.01,
});
```

## 🧪 Tests

```bash
npm test
```

All 61 tests use Node's built-in test runner and **mock every HTTP call**, so
they never spend real API credits.

## 🤝 Contributing

Issues and pull requests welcome — especially new provider files for more
models. Please keep the provider contract (`{ id, label, hasKey(), generate() }`)
and add a test alongside any new provider.

## 📄 License

[MIT](LICENSE) © kfir bekhavod
