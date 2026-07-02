# Image Generation CLI (`genimage`) — Design

**Date:** 2026-07-02
**Status:** Approved (pending spec review)
**Author:** kfir (with Claude)

## Purpose

A command-line tool that AI agents (Claude Code and others) call to generate a
single image with a chosen model at an exact pixel size, saved to a given path.
Use cases: "logo of a cat, 512×512 → assets/cat.png", "app background, 1920×1080".

This is a **separate use** from the arena (the comparison web app). The arena
stays exactly as it is; this adds a CLI layer that reuses the arena's providers.

## Goals

- One command generates one image: prompt + model + exact size → saved file.
- Reuse all of the arena's **image** models, selectable by id; default `gpt-image-1`.
- Guarantee the **exact** requested pixel dimensions (via resize/cover-crop).
- **Machine-readable** output (a single JSON line) so a calling agent can parse
  the saved path and cost.
- Clear, agent-friendly errors on stderr with a non-zero exit code.

## Non-Goals (YAGNI)

- No video (image models only; video ids are rejected with a clear message).
- No batch/multi-image, no prompt templating, no upscaling models.
- No changes to the arena web app or its providers.
- No server needed — the CLI calls providers directly (no running server required).

## Hard constraint

**Do not change the arena.** Providers keep their `generate(prompt)` signature
and current behavior; all sizing happens in the CLI. The arena's existing 61
tests must stay green.

## CLI interface

```bash
node bin/genimage.mjs "<prompt>" --out <path> [--model <id>] [--size <WxH>]
node bin/genimage.mjs --list-models
```

- **Prompt**: first positional argument (required unless `--list-models`).
- `--out <path>`: required. Output file path; format inferred from extension
  (`.png` | `.jpg`/`.jpeg` | `.webp`).
- `--model <id>`: default `gpt-image-1`. One of the image model ids (below).
- `--size <WxH>`: default `1024x1024`. Exact output pixels, e.g. `512x512`,
  `1920x1080`. Must match `^\d+x\d+$`.
- `--list-models`: prints available image model ids (one per line) and exits 0.

**Success (stdout, exit 0):** one JSON line, e.g.
```json
{"path":"./assets/cat-logo.png","model":"gpt-image-1","size":"512x512","ms":4200,"cost":0.04}
```

**Failure (stderr, non-zero exit):** a human-readable message (see Error handling).

## Supported models (image only)

Reused from the arena, by id: `gpt-image-1` (default), `gpt-image-2`,
`replicate-flux`, `replicate-flux-pro`, `replicate-ideogram`, `replicate-imagen`.
Video providers (`kind: 'video'`) are rejected with a clear message.

## Architecture

```
bin/genimage.mjs  (CLI entry)
   │  parse args (Node built-in util.parseArgs)
   ├─ src/generateImage.js   → provider by id → generate(prompt) → raw bytes
   ├─ src/resizeImage.js      → sharp: exact WxH (cover-crop) → write --out
   └─ print JSON { path, model, size, ms, cost }
```

### Components

**`bin/genimage.mjs`**
- Parses args with `util.parseArgs`; validates prompt/out/size; handles
  `--list-models`.
- Calls `generateImage`, then `resizeToExact`, then prints the JSON line.
- Maps thrown errors to a stderr message + non-zero exit.

**`src/generateImage.js`** — `generateImage({ model, prompt, providersDir })`
- Loads providers via the existing `loadProviders(providersDir)` (default: the
  real `providers/` dir).
- Finds the provider whose `id === model`; if none → throws
  `Unknown model "<id>". Available: <ids>`.
- If `provider.kind === 'video'` → throws `"<id>" is a video model; genimage is image-only`.
- If `!provider.hasKey()` → throws `No API key for "<id>". Set <ENV> in .env`
  (derive the env var name from the provider family, e.g. OPENAI_API_KEY /
  REPLICATE_API_TOKEN — see note).
- Calls `provider.generate(prompt)`, then materializes `result.image` to a
  `Buffer`: a `data:<mime>;base64,<...>` URL is decoded directly; an `https://`
  URL is fetched (built-in `fetch`) and read as bytes.
- Returns `{ buffer, mime, ms: result.ms, cost: result.cost }`.
- Test seam: exported `__setFetch` for the https-download path.

> **Key-name note:** providers don't currently expose which env var they need.
> To give a precise "set X" message, `generateImage` maps by provider id prefix:
> ids starting `gpt-image`/`openai` → `OPENAI_API_KEY`; ids starting `replicate`
> → `REPLICATE_API_TOKEN`. If a future provider doesn't match, the message falls
> back to a generic "its API key". (Providers themselves are NOT changed.)

**`src/resizeImage.js`** — `resizeToExact(buffer, width, height, outPath)`
- Uses `sharp(buffer).resize(width, height, { fit: 'cover', position: 'center' })`
  then `.toFile(outPath)` (sharp picks the encoder from the extension).
- Returns nothing meaningful on success; throws on invalid input/dimensions.

### New dependency

`sharp` (image resize/crop). Added to `package.json` dependencies.

## Data flow

1. Agent runs `node bin/genimage.mjs "a cat logo" --model gpt-image-1 --size 512x512 --out assets/cat.png`.
2. CLI validates args.
3. `generateImage` → provider generates at its own default size; returns raw bytes.
4. `resizeToExact` → sharp produces exactly 512×512 (center cover-crop), writes `assets/cat.png`.
5. CLI prints `{"path":"assets/cat.png","model":"gpt-image-1","size":"512x512","ms":...,"cost":0.04}`.

## Error handling

| Situation | Behavior |
|---|---|
| No prompt (and not `--list-models`) | stderr usage message, exit 1 |
| Missing `--out` | stderr "`--out <path>` is required", exit 1 |
| `--size` not `WxH` | stderr "invalid --size (expected WxH, e.g. 512x512)", exit 1 |
| Unknown `--model` | stderr lists valid ids, exit 1 |
| Video model id | stderr "image-only" message, exit 1 |
| Missing API key | stderr "Set <ENV> in .env", exit 1 |
| Provider/API error | stderr passes the provider error, exit 1 |

Only the success JSON is ever written to stdout.

## Testing

- **`src/generateImage.js`** — against a fixture providers dir (a fake provider
  returning a tiny `data:image/png;base64,...`): asserts `{ buffer, mime, cost }`;
  unknown-model, video-id, and missing-key errors; and the https-download path
  via injected `__setFetch`. No network.
- **`src/resizeImage.js`** — feed a small sharp-generated image buffer through
  `resizeToExact`, read the output back with `sharp(...).metadata()`, assert
  `width`/`height` equal the requested exact size. Real sharp, no network.
- **`bin/genimage.mjs`** — light integration: run the arg parser + happy path
  against the fixture provider (image written, JSON printed); plus `--list-models`
  and one error case (bad size). No network.
- Arena's existing 61 tests remain green (no arena files change).

## Cost

Each invocation spends real API money (same per-model costs as the arena). The
JSON output includes `cost` so agents can track spend. Documented in README.

## Rollout

Build with TDD + per-task review + final whole-branch review on a feature
branch; then merge to `main` and push. README gains a "CLI for agents" section.
