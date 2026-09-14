const withDefaults = require('./withDefaults.cjs');

/** Creates a reusable shallow default-merging function. */
function defaultsFor(defaultValues) {
  if (defaultValues == null || typeof defaultValues !== 'object') {
    throw new TypeError('The defaultValues must be an object, but found: ' + defaultValues);
  }

  return (values) => withDefaults(defaultValues, values);
}

module.exports = defaultsFor;
