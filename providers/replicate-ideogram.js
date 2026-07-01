import { makeReplicateProvider } from '../src/replicateProvider.js';

export default makeReplicateProvider({
  id: 'replicate-ideogram',
  label: 'Ideogram v3 turbo',
  model: 'ideogram-ai/ideogram-v3-turbo',
  cost: 0.03, // rough estimate
});
