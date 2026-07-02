#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateImage } from '../src/generateImage.js';
import { resizeToExact } from '../src/resizeImage.js';
import { loadProviders } from '../src/registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROVIDERS_DIR = join(__dirname, '..', 'providers');

const USAGE = `Usage: genimage "<prompt>" --out <path> [--model <id>] [--size <WxH>]
       genimage --list-models`;

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
    const ids = providers.filter((p) => (p.kind ?? 'image') !== 'video').map((p) => p.id);
    return { code: 0, stdout: ids.join('\n') + '\n', stderr: '' };
  }

  const prompt = positionals[0];
  if (!prompt) return { code: 1, stdout: '', stderr: `error: prompt is required\n${USAGE}\n` };
  if (!values.out) return { code: 1, stdout: '', stderr: `error: --out <path> is required\n${USAGE}\n` };

  const sizeMatch = /^(\d+)x(\d+)$/.exec(values.size);
  if (!sizeMatch) return { code: 1, stdout: '', stderr: `error: invalid --size "${values.size}" (expected WxH, e.g. 512x512)\n` };
  const width = Number(sizeMatch[1]);
  const height = Number(sizeMatch[2]);

  try {
    const { buffer, ms, cost } = await generateImage({ model: values.model, prompt, providersDir });
    await resizeToExact(buffer, width, height, values.out);
    const json = JSON.stringify({ path: values.out, model: values.model, size: values.size, ms, cost });
    return { code: 0, stdout: json + '\n', stderr: '' };
  } catch (err) {
    return { code: 1, stdout: '', stderr: `error: ${err.message}\n` };
  }
}

// Run when invoked directly (not when imported by tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const res = await main(process.argv.slice(2));
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  process.exit(res.code);
}
