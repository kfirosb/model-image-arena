import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
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
