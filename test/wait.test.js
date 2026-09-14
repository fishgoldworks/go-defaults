const wait = require('@fishgold/go-js/wait');

describe('wait', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('resolves after specified delay', async () => {
    const promise = wait(1000);
    jest.advanceTimersByTime(1000);
    await expect(promise).resolves.toBeUndefined();
  });

  test('resolves immediately with zero delay', async () => {
    const promise = wait(0);
    jest.advanceTimersByTime(0);
    await expect(promise).resolves.toBeUndefined();
  });

  test('resolves after fractional delay (rounded by JS)', async () => {
    const promise = wait(2.5);
    jest.advanceTimersByTime(3);
    await expect(promise).resolves.toBeUndefined();
  });

  test('resolves after negative delay (treated as 0)', async () => {
    const promise = wait(-100);
    jest.advanceTimersByTime(0);
    await expect(promise).resolves.toBeUndefined();
  });
});
