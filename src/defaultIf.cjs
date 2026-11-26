/**
 * Selects the fallback when the predicate returns true.
 *
 * By default, only `undefined` selects the fallback. A custom predicate replaces
 * that test and receives the supplied value once. Both values are evaluated before
 * the call. Objects and functions are returned by reference.
 *
 * @param {*} value The value to test.
 * @param {*} fallback The value to return when the test passes.
 * @param {function(*): boolean} [predicate] Defaults to `value => value === undefined`.
 * @returns {*} The selected value.
 * @throws {TypeError} Either value argument is omitted, or the predicate or its result is invalid.
 * @example
 * const { defaultIf } = require('go-defaults');
 * defaultIf(undefined, 'Home');                       // => 'Home'
 * defaultIf(null, 'Home', value => value === null);   // => 'Home'
 * @see [Full API documentation](../docs/API.md#defaultifvalue-fallback-predicate)
 */
function defaultIf(value, fallback, predicate) {
  if (arguments.length < 2) {
    throw new TypeError('A value and fallback are required.');
  }

  if (predicate === undefined) {
    return value === undefined ? fallback : value;
  }

  if (typeof predicate !== 'function') {
    throw new TypeError('Expected predicate to be a function.');
  }

  const useFallback = predicate(value);

  if (typeof useFallback !== 'boolean') {
    throw new TypeError('The predicate must return a boolean.');
  }

  return useFallback ? fallback : value;
}

module.exports = defaultIf;
