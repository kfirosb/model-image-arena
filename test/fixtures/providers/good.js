export default {
  id: 'good',
  label: 'Good Fixture',
  hasKey() { return true; },
  async generate(_prompt) {
    return { image: 'data:image/png;base64,AAAA', ms: 5, cost: 0 };
  },
};
