# Guide for AI agents: generating images with `genimage`

This repo ships a CLI that generates ONE image at an EXACT size and saves it to a
path. Use it whenever you need to create an image asset (logo, icon, background,
illustration) for a project.

## Command

```bash
node bin/genimage.mjs "<prompt>" --out <path> [--model <id>] [--size <WxH>]
```

- `"<prompt>"` — required. What to draw. Be specific (style, subject, background).
- `--out <path>` — required. Where to save. Format is taken from the extension
  (`.png`, `.jpg`, `.webp`).
- `--model <id>` — optional, default `gpt-image-1`.
- `--size <WxH>` — optional, default `1024x1024`. The image is generated then
  cropped/resized to EXACTLY these pixels.

Run from the repo root. Requires API keys in `.env` (`OPENAI_API_KEY` and/or
`REPLICATE_API_TOKEN`).

## Output (how to read the result)

On success it prints ONE JSON line to **stdout** and exits 0:

```json
{"path":"./assets/cat.png","model":"gpt-image-1","size":"512x512","ms":4200,"cost":0.04}
```

Parse that line and use `path` — the file is already saved there at the exact size.

On failure it prints a message to **stderr** and exits non-zero. Always check the
exit code; treat any non-zero exit as "no image was produced" and read stderr for
why (e.g. missing API key, unknown model, invalid size).

## Models

Discover them at runtime:

```bash
node bin/genimage.mjs --list-models
```

Current image models (choose with `--model`):

| id | notes |
|----|-------|
| `gpt-image-1` | OpenAI. Best for text/logos. **Default.** |
| `gpt-image-2` | OpenAI. Higher quality. |
| `replicate-flux` | FLUX schnell. Fast/cheap. |
| `replicate-flux-pro` | FLUX 1.1 pro. High quality. |
| `replicate-ideogram` | Best at rendering text inside the image. |
| `replicate-imagen` | Google Imagen. |

Only image models are available here (video is not exposed to this CLI).

## Examples

```bash
# A logo asset at an exact size
node bin/genimage.mjs "minimal flat vector logo of a fox, solid background" \
  --model gpt-image-1 --size 512x512 --out ./public/images/fox-logo.png

# A wide app background
node bin/genimage.mjs "soft abstract gradient background, blue and purple" \
  --size 1920x1080 --out ./public/images/bg.jpg

# Text-heavy image → prefer ideogram
node bin/genimage.mjs "poster that says SALE 50% OFF, bold retro type" \
  --model replicate-ideogram --size 1024x1024 --out ./assets/sale.png
```

## Rules of thumb

- **Costs real money.** Each call spends API credits (`cost` is in the JSON,
  roughly $0.003–$0.08 per image depending on model). Generate deliberately, not
  in loops.
- **Pick the size the design needs** — the output is guaranteed to be exactly
  `WxH`. Very different aspect ratios are center-cropped.
- **One image per call.** For multiple assets, call it once per asset.
- **Don't print the API keys** and don't read `.env` — the CLI handles keys itself.
