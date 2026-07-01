# Video Support — Design

**Date:** 2026-07-01
**Status:** Approved (pending spec review)
**Author:** kfir (with Claude)

## Purpose

Add text-to-video models to Model Image Arena alongside the existing image
models, so one prompt can be compared across image AND video models. Because
video models are slow (minutes) and expensive (dollars per clip), the user must
**explicitly pick which models run** each time — nothing expensive fires by
accident.

## Hard constraint

**Do not change existing image behavior.** All image providers, their tests,
and the current default request path must keep working exactly as they do now.
Every change below is additive.

## Goals

- Per-model **opt-in selection**: checkbox per tile; only selected models run.
- Video models default **unchecked**; image models default **checked**.
- A live **estimated-cost total** for the current selection, shown before Generate.
- Video results render as `<video controls>` tiles; images stay `<img>`.
- All new video providers are pluggable files, like image providers.
- Tests mock all HTTP — no real API spend, ever.

## Non-Goals (YAGNI)

- No video editing, trimming, or download-all.
- No per-model parameter UI (duration/resolution are sensible fixed defaults;
  tunable in the provider file).
- No saved-run gallery (separate future idea).

## Models (all opt-in)

| Model | Provider | Endpoint style | Default clip |
|---|---|---|---|
| Sora-2 | OpenAI | async create + poll | shortest/cheapest |
| Sora-2 pro | OpenAI | async create + poll | shortest/cheapest |
| Veo-3 fast | Replicate | create + poll | ~5s |
| Kling v2.1 | Replicate | create + poll | ~5s |
| Wan 2.5 t2v fast | Replicate | create + poll | ~5s |
| Hailuo-02 (Minimax) | Replicate | create + poll | ~5s |
| LTX-video | Replicate | create + poll | ~5s |
| Hunyuan-video | Replicate | create + poll | ~5s |

> Costs are estimates shown for budgeting; verify against live pricing. Premium
> models (Sora, Veo) can be several dollars per clip — hence opt-in.

## Provider contract (extended, backward compatible)

Existing image providers are unchanged and keep returning `{ image, ms, cost }`.
Video providers return:

```js
{ video: 'https://…mp4', type: 'video', ms, cost }
```

A provider object MAY also declare metadata used by the UI and runner:

```js
{
  id, label,
  kind: 'video',        // optional; 'image' assumed if absent
  cost: 0.30,           // estimated USD per run, for the cost total + tile
  timeoutMs: 600000,    // optional; runOne default stays 60000 for images
  hasKey(), generate(prompt),
}
```

`runOne` changes (additive): pass through `type` and `video` from `generate`'s
result, and use `provider.timeoutMs || 60000`. Image results (no `type`) are
reported exactly as before.

## API changes

- `GET /api/providers` → each entry gains `kind` (`'image'|'video'`) and `cost`
  (estimated USD per run) so the UI can group, default-check, and total.
- `POST /api/generate { prompt, ids? }`:
  - `ids` optional array of provider ids to run.
  - If `ids` omitted → run all keyed providers (today's behavior, unchanged).
  - If `ids` present → run only those (that are keyed). Never runs an unselected
    (e.g. expensive) model.

## Async video mechanics

Video generation is not synchronous:

- **Replicate video factory** (`src/replicateVideoProvider.js`): POST to the
  model predictions endpoint WITHOUT `Prefer: wait`, get `{ id, urls.get }`,
  then poll `GET urls.get` every few seconds until `status` is `succeeded`
  (return `output` video URL), `failed`/`canceled` (throw), respecting a max
  wait derived from `timeoutMs`. Reuses the existing Replicate concurrency
  limiter + 429 retry.
- **OpenAI Sora factory** (`src/soraProvider.js`): POST `create` to the videos
  endpoint, poll status until complete, return the playable video URL/content
  URL. Implemented against the documented async shape; flagged for a live check.

Both keep the `__setFetch` (and `__setSleep`) seams so tests run instantly with
mocked HTTP and no real polling delay.

## Frontend

- On load, `GET /api/providers` → render a tile per provider with a **checkbox**.
  Group image vs video; check image tiles, leave video tiles unchecked.
- Show each tile's estimated cost. A header line shows
  **"Estimated: $X.XX for N selected models"**, updated live as boxes toggle.
- **Generate** sends `{ prompt, ids: [checked ids] }`.
- Rendering: `type === 'video'` → `<video src=… controls>`; otherwise `<img>`.
  Video tiles show a "generating… (can take a few minutes)" state.
- Existing image tiles/behavior otherwise unchanged.

## Cost safety

- Nothing runs unless its box is checked.
- Video defaults unchecked; video clips use the cheapest/shortest settings.
- The selection cost estimate is always visible before Generate.

## Testing

- New video-factory contract tests (create → poll → succeeded → video URL;
  poll → failed → throws; timeout path), all with mocked fetch + injected sleep.
- `runOne` test: a `type:'video'` result passes through `video`/`type`; a
  provider `timeoutMs` is honored; image results unchanged.
- `generate`/endpoint test: `ids` filter runs only selected providers; omitting
  `ids` runs all (unchanged).
- All existing image tests must stay green.

## Rollout

Build with TDD + per-task review + final whole-branch review, on a feature
branch, then merge to `main` and push.
