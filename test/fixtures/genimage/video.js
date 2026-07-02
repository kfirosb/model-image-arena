export default {
  id: 'fake-video',
  label: 'Fake Video',
  kind: 'video',
  cost: 1.0,
  hasKey() { return true; },
  async generate() { throw new Error('should not be called'); },
};
