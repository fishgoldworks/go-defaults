const parseBool = require('@fishgold/go-js/parseBool');

describe('parseBool', () => {
  // Boolean literals
  test('returns true for boolean true', () => {
    expect(parseBool(true)).toBe(true);
  });

  test('returns false for boolean false', () => {
    expect(parseBool(false)).toBe(false);
  });

  // String values: valid
  test('returns true for string "true"', () => {
    expect(parseBool('true')).toBe(true);
  });

  test('returns false for string "false"', () => {
    expect(parseBool('false')).toBe(false);
  });

  test('returns true for string " TRUE " with spaces and case-insensitivity', () => {
    expect(parseBool(' TRUE ')).toBe(true);
  });

  test('returns false for string "fALsE" with mixed case', () => {
    expect(parseBool('fALsE')).toBe(false);
  });

  // String values: invalid
  test('returns undefined for invalid string "yes"', () => {
    expect(parseBool('yes')).toBeUndefined();
  });

  test('returns undefined for empty string', () => {
    expect(parseBool('')).toBeUndefined();
  });

  test('returns undefined for string "0"', () => {
    expect(parseBool('0')).toBeUndefined();
  });

  // Boolean object instances
  test('returns true for Boolean object with true', () => {
    expect(parseBool(new Boolean(true))).toBe(true);
  });

  test('returns false for Boolean object with false', () => {
    expect(parseBool(new Boolean(false))).toBe(false);
  });

  // Non-Boolean objects
  test('returns undefined for plain object', () => {
    expect(parseBool({})).toBeUndefined();
  });

  test('returns undefined for array input', () => {
    expect(parseBool([true])).toBeUndefined();
  });

  test('returns undefined for number input', () => {
    expect(parseBool(1)).toBeUndefined();
  });

  test('returns undefined for null', () => {
    expect(parseBool(null)).toBeUndefined();
  });

  test('returns undefined for undefined', () => {
    expect(parseBool(undefined)).toBeUndefined();
  });

  test('returns undefined for function input', () => {
    expect(parseBool(() => true)).toBeUndefined();
  });
});
