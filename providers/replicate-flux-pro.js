import { makeReplicateProvider } from '../src/replicateProvider.js';

export default makeReplicateProvider({
  id: 'replicate-flux-pro',
  label: 'Replicate FLUX 1.1 pro',
  model: 'black-forest-labs/flux-1.1-pro',
  cost: 0.04, // rough estimate
});
