import { makeReplicateProvider } from '../src/replicateProvider.js';

// Re-export the test seam so existing tests can inject a fake fetch.
export { __setFetch } from '../src/replicateProvider.js';

export default makeReplicateProvider({
  id: 'replicate-flux',
  label: 'Replicate FLUX schnell',
  model: 'black-forest-labs/flux-schnell',
  cost: 0.003, // rough estimate
  input: { num_outputs: 1 },
});
