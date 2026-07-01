# Image Model Comparison

Local tool to send one prompt to several image-generation models in parallel
and compare the results in a grid.

## Setup

```bash
npm install
cp .env.example .env   # then fill in the keys you have
npm start              # open http://localhost:3000
```

Only providers whose key is set in `.env` will run. Others show a grey
"no API key" tile until you add their key.

## Keys

- `OPENAI_API_KEY` — OpenAI gpt-image-1.
- `REPLICATE_API_TOKEN` — Replicate (FLUX schnell here; unlocks many more models).

## Add a new model

Drop a file in `providers/`, e.g. `providers/mymodel.js`:

```js
export default {
  id: 'mymodel',
  label: 'My Model',
  hasKey() { return !!process.env.MYMODEL_KEY; },
  async generate(prompt) {
    // return { image, ms, cost }
    // image: an https URL or a data:image/...;base64,... URL
  },
};
```

Restart the server — it is auto-discovered. Add `MYMODEL_KEY` to `.env`.

## Test

```bash
npm test
```

All provider tests mock HTTP, so they never spend real API credits.
