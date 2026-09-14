const isJson = require('@fishgold/go-js/isJson');

describe('isJson', () => {
  // Valid JSON strings
  test('returns true for valid JSON object string', () => {
    expect(isJson('{"id":123}')).toBe(true);
  });

  test('returns true for valid JSON array string', () => {
    expect(isJson('[1,2,3]')).toBe(true);
  });

  test('returns true for valid JSON string literal', () => {
    expect(isJson('"Hello"')).toBe(true);
  });

  test('returns true for valid JSON number string', () => {
    expect(isJson('123')).toBe(true);
  });

  test('returns true for valid JSON boolean strings', () => {
    expect(isJson('true')).toBe(true);
    expect(isJson('false')).toBe(true);
  });

  test('returns true for valid JSON null string', () => {
    expect(isJson('null')).toBe(true);
  });

  // Invalid JSON strings
  test('returns false for invalid JSON with unquoted key', () => {
    expect(isJson('{id:123}')).toBe(false);
  });

  test('returns false for unterminated JSON array', () => {
    expect(isJson('[1,2,3')).toBe(false);
  });

  test('returns false for backtick-quoted string', () => {
    expect(isJson('`Hello`')).toBe(false);
  });

  test('returns false for string "undefined"', () => {
    expect(isJson('undefined')).toBe(false);
  });

  // Non-string values
  test('returns false for null', () => {
    expect(isJson(null)).toBe(false);
  });

  test('returns false for undefined', () => {
    expect(isJson(undefined)).toBe(false);
  });

  test('returns false for number input', () => {
    expect(isJson(123)).toBe(false);
  });

  test('returns false for boolean input', () => {
    expect(isJson(true)).toBe(false);
    expect(isJson(false)).toBe(false);
  });

  test('returns false for object input', () => {
    expect(isJson({ id: 1 })).toBe(false);
  });

  test('returns false for array input', () => {
    expect(isJson([1, 2, 3])).toBe(false);
  });
});
