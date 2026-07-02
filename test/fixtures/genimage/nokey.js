export default {
  id: 'fake-nokey',
  label: 'Fake NoKey',
  cost: 0.01,
  hasKey() { return false; },
  async generate() { throw new Error('should not be called'); },
};
