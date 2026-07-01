export default {
  id: 'nokey',
  label: 'No Key Fixture',
  hasKey() { return false; },
  async generate(_prompt) {
    throw new Error('should never be called without a key');
  },
};
