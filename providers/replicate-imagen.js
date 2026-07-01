import { makeReplicateProvider } from '../src/replicateProvider.js';

export default makeReplicateProvider({
  id: 'replicate-imagen',
  label: 'Google Imagen 4 (fast)',
  model: 'google/imagen-4-fast',
  cost: 0.02, // rough estimate
});
