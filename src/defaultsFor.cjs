const withDefaults = require('./withDefaults.cjs');

/**
 * Creates a reusable function that applies the same defaults to multiple objects using a
 * shallow merge.
 *
 * Pass defaults once, then call the returned function with overrides for each object. Each
 * call starts with the current defaults, so overrides from one call do not carry over.
 *
 * Overrides are applied from left to right. Missing properties and `undefined` keep earlier
 * values; `null`, `false`, `0` and empty strings replace them. Omitting overrides makes a
 * shallow copy of the current defaults. Whole `null` or `undefined` arguments are skipped.
 *
 * The returned function reads the original defaults on each call, so later edits affect
 * future results. Each result is a new object, but nested values remain shared. The merge
 * does not write to the defaults or overrides.
 *
 * @param {object} defaultValues The defaults object to reuse. Required; must be an object other
 * than `null`. Functions are rejected.
 * @returns {Function} A function accepting zero or more override objects. Each call returns a new object
 * with the defaults applied; nested values retain their original references.
 * @throws {TypeError} The defaults are missing, `null`, `undefined` or not an object. Rejected
 * values are not coerced or invoked.
 * @throws Calls to the returned function follow the validation and error rules of `withDefaults`,
 * including getter and proxy errors and processing arguments in order.
 * @example
 * const { defaultsFor } = require('go-defaults');
 * const applyDefaults = defaultsFor({ title: 'Home', visible: true });
 * applyDefaults({ title: 'About' });   // => { title: 'About', visible: true }
 * applyDefaults({ visible: false });   // => { title: 'Home', visible: false }
 * @see [Full API documentation](../docs/API.md#defaultsfordefaultvalues)
 */
function defaultsFor(defaultValues) {
  if (defaultValues == null || typeof defaultValues !== 'object') {
    // rejected values must not run coercion hooks while creating an error.
    throw new TypeError('The defaultValues must be a non-null object.');
  }

  // apply every override layer in order, retaining defaults by reference.
  return (...values) => withDefaults(defaultValues, ...values);
}

module.exports = defaultsFor;
