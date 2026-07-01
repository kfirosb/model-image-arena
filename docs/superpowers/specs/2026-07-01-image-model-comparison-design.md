# Image Model Comparison — Design

**Date:** 2026-07-01
**Status:** Approved
**Author:** kfir (with Claude)

## Purpose

A local, personal tool to compare image-generation AI models side by side. Type
one prompt (e.g. "a frog"), and see the output of every configured model in a
labeled grid, so I can judge which model is best for my project.

Single-user, runs on my machine only. No accounts, no hosting, no database.

## Goals

- Enter a prompt once, fan the same prompt out to many image models **in parallel**.
- See all results in one grid: image, model name, generation time, cost, status.
- Add or remove models by dropping in a provider file + setting an API key.
- Models without a configured key are skipped gracefully (shown as a placeholder),
  not errors.

## Non-Goals (YAGNI)

- No user accounts / auth.
- No database or persistent history (results are in-memory per session; optional
  save-to-folder only).
- No scoring/analytics beyond a simple ★ favorite toggle.
- No deployment / hosting — local only.

## Providers (target roster)

Pluggable. Configured-and-keyed providers run; others are skipped.

| Provider   | Notes                                                        | Key today? |
|------------|-------------------------------------------------------------|-----------|
| OpenAI     | gpt-image-1 / DALL·E                                          | ✅ have    |
| Replicate  | Aggregator: FLUX, SDXL, Imagen, Ideogram under one token     | recommended next |
| Google     | Gemini / Imagen                                              | later     |
| FLUX (BFL) | Black Forest Labs direct API                                 | later     |
| Fal.ai     | Aggregator: FLUX/SDXL/Ideogram etc.                          | later     |
| Ideogram   | Strong at text-in-image                                      | later     |

> To reach a real 5-different-models bake-off immediately, add a **Replicate**
> token — one signup unlocks 4+ models.

## Architecture

```
Browser (index.html + app.js)
      │  POST /api/generate { prompt }
      ▼
Node.js / Express server
      │  fan out in parallel (Promise.allSettled)
      ├─ providers/openai.js       ✅
      ├─ providers/replicate.js
      ├─ providers/google.js
      ├─ providers/flux.js
      ├─ providers/falai.js
      └─ providers/ideogram.js
      ▼
returns [{ model, label, image, ms, cost, status, error? }]
```

### Provider plugin contract

Each `providers/<name>.js` exports:

```js
export default {
  id: 'openai',
  label: 'OpenAI gpt-image-1',
  hasKey() { return !!process.env.OPENAI_API_KEY; },
  async generate(prompt) {
    // returns { image, ms, cost }
    //   image: data URL or https URL the browser can render
    //   ms:    generation time in milliseconds
    //   cost:  estimated USD number (0 if unknown)
  },
};
```

- The server auto-discovers all files in `providers/`, calls `hasKey()`, and only
  invokes `generate()` for keyed providers. Unkeyed providers are returned with
  `status: 'no_key'` so the UI can grey them out.
- Adding a new model later = add one file. No other code changes.

### Server behavior

- `POST /api/generate { prompt }` → runs all keyed providers with
  `Promise.allSettled`, so one slow/failing model never blocks the others.
- Per-model timeout (~60s). Timeouts and API errors return `status: 'error'` with
  a message, not a thrown request.
- `GET /api/providers` → list of `{ id, label, status }` so the UI can render
  tiles (including greyed no-key ones) before any run.
- API keys are read from `.env` (gitignored) and never sent to the browser.

## Frontend

Single static page (`index.html` + `app.js`, plain — no framework needed):

- Prompt text box + **Generate** button.
- Responsive grid of tiles, one per provider. Each tile shows:
  - the image (or a spinner while running, or a status placeholder),
  - model label,
  - generation time (ms) and estimated cost,
  - a ★ toggle to mark a favorite (in-memory only).
- Tile states: `idle` → `loading` → `done` | `error` | `no_key`.
- A run stays on screen for comparison; a new Generate replaces it.
- Optional: a "Save run" button that writes the images + a small JSON to a
  timestamped folder on disk.

## Error handling

| Situation            | Result                                             |
|----------------------|----------------------------------------------------|
| Provider has no key  | Grey tile, "add key" hint. Never called.           |
| Provider API error   | Red tile with the error message.                   |
| Provider timeout     | Red tile, "timed out". Other tiles unaffected.     |
| All providers unkeyed| Page still loads; grid is all grey placeholders.   |

## Testing

- **Provider contract tests** with mocked HTTP — verify each provider maps its API
  response to `{ image, ms, cost }` and reports `hasKey()` correctly. No real spend.
- **Server test**: `/api/generate` runs keyed providers, skips unkeyed, and one
  failing provider does not break the response (allSettled behavior).
- **Opt-in live smoke test** against OpenAI (env-gated) to confirm the real key path.

## Tech stack

- Node.js + Express (tiny server).
- Plain HTML/CSS/JS frontend (no build step).
- `.env` for keys, `.gitignore` covers `.env` and any saved-run output.
- Run with `npm install` then `npm start`, open `http://localhost:PORT`.

## Open items / future

- Add Replicate token to reach 5 models.
- Later providers (Google, FLUX, Fal.ai, Ideogram) added as plugin files.
- Possible future: cost totals per run, side-by-side rating history — deferred.
