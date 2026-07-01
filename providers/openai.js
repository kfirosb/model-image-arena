import { makeOpenAIProvider } from '../src/openaiProvider.js';

// Re-export the test seam so existing tests can inject a fake fetch.
export { __setFetch } from '../src/openaiProvider.js';

export default makeOpenAIProvider({
  id: 'openai',
  label: 'OpenAI gpt-image-1',
  model: 'gpt-image-1',
  cost: 0.04, // rough estimate for 1024x1024
});
