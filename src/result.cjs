/** Evaluates a function with the supplied parameters or returns a non-function value unchanged. */
function result(value, ...params) {
  return typeof value === 'function' ? value(...params) : value;
}

module.exports = result;
