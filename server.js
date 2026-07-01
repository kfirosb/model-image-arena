import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadProviders } from './src/registry.js';
import { generateAll, listProviders } from './src/generate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const providersDir = join(__dirname, 'providers');

export const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/providers', async (_req, res) => {
  try {
    const providers = await loadProviders(providersDir);
    res.json({ providers: listProviders(providers) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.post('/api/generate', async (req, res) => {
  try {
    const prompt = (req.body?.prompt || '').trim();
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });
    const providers = await loadProviders(providersDir);
    const results = await generateAll(providers, prompt);
    res.json({ prompt, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

export function start(port = process.env.PORT || 3000) {
  return app.listen(port, () => {
    console.log(`Image Model Comparison running at http://localhost:${port}`);
  });
}

// Start only when run directly, not when imported by tests.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start();
}
