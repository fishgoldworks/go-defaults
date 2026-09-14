const withDefaults = require('@fishgold/go-js/withDefaults');

describe('withDefaults', () => {
  test('merges multiple objects, overriding properties from left to right, ignoring undefined', () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { b: undefined, c: 3 };
    const obj3 = { b: 4 };
    const result = withDefaults(obj1, obj2, obj3);
    expect(result).toEqual({ a: 1, b: 4, c: 3 });
  });

  test('returns an empty object if no objects are provided', () => {
    const result = withDefaults();
    expect(result).toEqual({});
  });

  test('correctly handles nullish values', () => {
    const result = withDefaults(undefined, null);
    expect(result).toEqual({});
  });

  test('returns the same object if only one object is provided', () => {
    const obj = { a: 1, b: 2 };
    const result = withDefaults(obj);
    expect(result).toEqual(obj);
  });

  test('ignores undefined values and does not overwrite existing properties with undefined', () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { a: undefined, b: 3 };
    const result = withDefaults(obj1, obj2);
    expect(result).toEqual({ a: 1, b: 3 });
  });

  test('handles objects with nested structures by not performing a deep merge', () => {
    const obj1 = { a: { x: 1 }, b: 2 };
    const obj2 = { a: { y: 2 }, b: undefined };
    const result = withDefaults(obj1, obj2);
    expect(result).toEqual({ a: { y: 2 }, b: 2 });
  });

  test('processes null values as valid properties, not ignoring them', () => {
    const obj1 = { a: null, b: 2 };
    const obj2 = { a: 3 };
    const result = withDefaults(obj1, obj2);
    expect(result).toEqual({ a: 3, b: 2 });
  });
});
