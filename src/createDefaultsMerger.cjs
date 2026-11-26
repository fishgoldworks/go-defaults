const mergeDefaults = require('./mergeDefaults.cjs');

/**
 * Creates a reusable function that merges objects with your defaults rules.
 *
 * Pass defaults followed by overrides on each call. By default, the merge is shallow
 * and only `undefined` triggers fallback. A custom rule receives each visited override
 * value and its own enumerable key. Return `true` to keep the most recent earlier
 * value or leave the property absent. Set a depth to merge matching nested records.
 *
 * @param {object} [options] Configuration for the reusable merge.
 * @param {function(*, (string|symbol)): boolean} [options.shouldFallback] Defaults to `value => value === undefined`.
 * @param {number} [options.mergeDepth=0] Maximum number of nested record levels to merge below the root.
 * @returns {Function} A function that takes defaults and overrides and returns a fresh plain object.
 * @throws {TypeError} Invalid options, source layer, predicate, predicate result or depth type.
 * @throws {RangeError} The depth is not a nonnegative safe integer.
 * @example
 * const { createDefaultsMerger } = require('go-defaults');
 * const merge = createDefaultsMerger({ mergeDepth: 1 });
 * merge({ params: { bar: 2 } }, { params: { foo: 1 } }); // => { params: { bar: 2, foo: 1 } }
 * @see [Full API documentation](../docs/API.md#createdefaultsmergeroptions)
 */
function createDefaultsMerger(options = {}) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('Expected an options object.');
  }

  const { shouldFallback } = options;

  if (shouldFallback !== undefined && typeof shouldFallback !== 'function') {
    throw new TypeError('Expected shouldFallback to be a function.');
  }

  const { mergeDepth = 0 } = options;

  if (typeof mergeDepth !== 'number') {
    throw new TypeError('Expected mergeDepth to be a number.');
  }

  if (!Number.isSafeInteger(mergeDepth) || mergeDepth < 0) {
    throw new RangeError('Expected mergeDepth to be a nonnegative safe integer.');
  }

  function checkFallback(value, key) {
    const fallback = shouldFallback(value, key);

    if (typeof fallback !== 'boolean') {
      throw new TypeError('shouldFallback must return a boolean.');
    }

    return fallback;
  }

  const predicate = shouldFallback === undefined ? undefined : checkFallback;

  return (defaults, ...overrides) => mergeDefaults(defaults, overrides, predicate, mergeDepth);
}

module.exports = createDefaultsMerger;
