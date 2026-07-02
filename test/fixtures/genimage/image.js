const PNG_1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWM4ISf3HwAEugIEHAAUUwAAAABJRU5ErkJggg==';

export default {
  id: 'fake-image',
  label: 'Fake Image',
  cost: 0.02,
  hasKey() { return true; },
  async generate(_prompt) {
    return { image: `data:image/png;base64,${PNG_1x1}`, ms: 5, cost: 0.02 };
  },
};
