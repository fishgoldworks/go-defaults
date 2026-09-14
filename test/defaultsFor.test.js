const defaultsFor = require('@fishgold/go-js/defaultsFor');

describe('defaultsFor', () => {
  const withDefaults = defaultsFor({
    theme: 'light',
    language: 'en',
    fontSize: 'medium'
  });

  test('should return a new object with defaults applied when values are missing', () => {
    const result = withDefaults({});
    expect(result).toEqual({
      theme: 'light',
      language: 'en',
      fontSize: 'medium'
    });
  });

  test('should override default values with provided values', () => {
    const result = withDefaults({ theme: 'dark', fontSize: 'large' });
    expect(result).toEqual({
      theme: 'dark',
      language: 'en',
      fontSize: 'large'
    });
  });

  test('should not modify default values when the corresponding property is undefined in provided values', () => {
    const result = withDefaults({ theme: undefined });
    expect(result).toEqual({
      theme: 'light', // Defaults should be used here
      language: 'en',
      fontSize: 'medium'
    });
  });

  test('should not mutate the original object', () => {
    const values = { theme: 'dark' };
    const result = withDefaults(values);
    expect(result).not.toBe(values); // Make sure a new object is returned
  });

  test('should handle null values properly in the provided object', () => {
    const result = withDefaults({ theme: null });
    expect(result).toEqual({
      theme: null, // null should be treated as a valid value, not replaced by default
      language: 'en',
      fontSize: 'medium'
    });
  });

  test('should return an object with the same default values if no values are provided', () => {
    const result = withDefaults();
    expect(result).toEqual({
      theme: 'light',
      language: 'en',
      fontSize: 'medium'
    });
  });

  test('should handle edge case when default values are empty', () => {
    const withDefaults = defaultsFor({});
    const result = withDefaults({ theme: 'dark' });
    expect(result).toEqual({ theme: 'dark' }); // Should return the provided value as is
  });

  test('should handle edge case when values is null or undefined', () => {
    expect(withDefaults(null)).toEqual({
      theme: 'light',
      language: 'en',
      fontSize: 'medium'
    });

    expect(withDefaults(undefined)).toEqual({
      theme: 'light',
      language: 'en',
      fontSize: 'medium'
    });

    expect(withDefaults()).toEqual({
      theme: 'light',
      language: 'en',
      fontSize: 'medium'
    });
  });

  test('should throw an error if default values are not an object', () => {
    expect(() => defaultsFor(null)).toThrow(TypeError);
    expect(() => defaultsFor(null)).toThrow('The defaultValues must be an object, but found: null');
  });
});
