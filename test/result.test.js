const result = require('@fishgold/go-js/result');

describe('result', () => {
  // Function inputs
  test('calls a no-arg function and returns its result', () => {
    const fn = () => 'called';
    expect(result(fn)).toBe('called');
  });

  test('calls a function with parameters and returns result', () => {
    const add = (a, b) => a + b;
    expect(result(add, 2, 3)).toBe(5);
  });

  test('calls a function that returns undefined', () => {
    const fn = () => {};
    expect(result(fn)).toBeUndefined();
  });

  test('calls a function that throws an error', () => {
    const fn = () => {
      throw new Error('Test error');
    };
    expect(() => result(fn)).toThrow('Test error');
  });

  // Non-function values
  test('returns a number value as-is', () => {
    expect(result(42)).toBe(42);
  });

  test('returns a string value as-is', () => {
    expect(result('hello')).toBe('hello');
  });

  test('returns a boolean value as-is', () => {
    expect(result(true)).toBe(true);
  });

  test('returns null as-is', () => {
    expect(result(null)).toBeNull();
  });

  test('returns undefined as-is', () => {
    expect(result(undefined)).toBeUndefined();
  });

  test('returns an object as-is', () => {
    const obj = { key: 'value' };
    expect(result(obj)).toBe(obj);
  });

  test('returns an array as-is', () => {
    const arr = [1, 2, 3];
    expect(result(arr)).toBe(arr);
  });
});
