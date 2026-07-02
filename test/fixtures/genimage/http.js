export default {
  id: 'fake-http',
  label: 'Fake HTTP',
  cost: 0.03,
  hasKey() { return true; },
  async generate(_prompt) {
    return { image: 'https://example/img.png', ms: 7, cost: 0.03 };
  },
};
