import { makeOpenAIProvider } from '../src/openaiProvider.js';

export default makeOpenAIProvider({
  id: 'openai-gpt-image-2',
  label: 'OpenAI gpt-image-2',
  model: 'gpt-image-2',
  cost: 0.08, // rough estimate — verify against current OpenAI pricing
});
