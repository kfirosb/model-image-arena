#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { generateImage } from '../src/generateImage.js';
import { resizeToExact } from '../src/resizeImage.js';
import { loadProviders } from '../src/registry.js';
import { resolveModel, displayModel } from '../src/modelAliases.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROVIDERS_DIR = join(__dirname, '..', 'providers');

const USAGE = `Usage: genimage "<prompt>" --out <path> [--model <id>] [--size <WxH>]
       genimage --list-models`;

// Re-exported so existing callers/tests importing resolveModel from this
// file keep working; the real definition lives in src/modelAliases.js.
export { resolveModel } from '../src/modelAliases.js';

// Returns { code, stdout, stderr } — no process.exit, so it's testable.
export async function main(argv, { providersDir = DEFAULT_PROVIDERS_DIR } = {}) {
  let values, positionals;
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        out: { type: 'string' },
        model: { type: 'string', default: 'gpt-image-1' },
        size: { type: 'string', default: '1024x1024' },
        'list-models': { type: 'boolean', default: false },
      },
    }));
  } catch (err) {
    return { code: 1, stdout: '', stderr: `error: ${err.message}\n${USAGE}\n` };
  }

  if (values['list-models']) {
    const providers = await loadProviders(providersDir);
    const ids = providers.filter((p) => (p.kind ?? 'image') !== 'video').map((p) => displayModel(p.id));
    return { code: 0, stdout: ids.join('\n') + '\n', stderr: '' };
  }

  const prompt = positionals[0];
  if (!prompt) return { code: 1, stdout: '', stderr: `error: prompt is required\n${USAGE}\n` };
  if (!values.out) return { code: 1, stdout: '', stderr: `error: --out <path> is required\n${USAGE}\n` };

  const sizeMatch = /^(\d+)x(\d+)$/.exec(values.size);
  if (!sizeMatch) return { code: 1, stdout: '', stderr: `error: invalid --size "${values.size}" (expected WxH, e.g. 512x512)\n` };
  const width = Number(sizeMatch[1]);
  const height = Number(sizeMatch[2]);
  if (width <= 0 || height <= 0) return { code: 1, stdout: '', stderr: `error: invalid --size "${values.size}" (expected WxH, e.g. 512x512)\n` };

  try {
    // `mime` is intentionally unused: output format comes from the --out
    // file extension via sharp, not from the provider's response mime type.
    const { buffer, ms, cost } = await generateImage({ model: resolveModel(values.model), prompt, providersDir });
    await resizeToExact(buffer, width, height, values.out);
    const json = JSON.stringify({ path: values.out, model: values.model, size: values.size, ms, cost });
    return { code: 0, stdout: json + '\n', stderr: '' };
  } catch (err) {
    return { code: 1, stdout: '', stderr: `error: ${err.message}\n` };
  }
}

// Run when invoked directly (not when imported by tests).
// True when run as the CLI (directly or via an npm-link symlink), false when
// imported by tests. realpath resolves a symlinked `genimage` back to this file.
function invokedAsCli() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (invokedAsCli()) {
  // Load the repo's .env so the CLI works from any folder without --env-file.
  try { process.loadEnvFile(join(__dirname, '..', '.env')); } catch { /* no .env; rely on real env vars */ }
  const res = await main(process.argv.slice(2));
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  process.exit(res.code);
}
