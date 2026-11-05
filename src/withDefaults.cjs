/**
 * Performs a shallow merge of defaults and overrides into a new object, preserving earlier
 * values when a property is missing or `undefined`.
 *
 * Use it to supply defaults without writing a separate fallback for each property. Pass
 * defaults first, then overrides from left to right. An `undefined` override keeps the most
 * recent earlier value; `null`, `false`, `0` and empty strings replace it.
 *
 * Only own enumerable string and symbol properties are copied. Each eligible getter is read
 * once, and special keys such as `__proto__` become own data properties. The merge does not
 * write to its sources; nested objects and arrays keep their original references.
 *
 * The fallback rule matches JavaScript default parameters and destructuring defaults, but
 * the input objects have already been evaluated when this function is called.
 *
 * @param {(Object|null|undefined)} [defaults] Initial defaults. `null` and `undefined` are skipped.
 * @param {...(Object|null|undefined)} overrides Override objects, applied from left to right.
 * Whole `null` and `undefined` arguments are skipped.
 * @returns {Object} A new plain object containing the combined properties. Nested values retain
 * their original references.
 * @throws {TypeError} An argument is not an object, `null` or `undefined`. Functions are rejected
 * without coercion or invocation. Arguments are processed in order; earlier side effects are not undone.
 * @throws Errors from source getters, proxies or reflection are passed through to the caller.
 * @example
 * const { withDefaults } = require('go-defaults');
 * const defaults = { title: 'Home', visible: true, count: 10 };
 * const overrides = { title: undefined, visible: false, count: 0 };
 * withDefaults(defaults, overrides);   // => { title: 'Home', visible: false, count: 0 }
 * @see [Full API documentation](../docs/API.md#withdefaultsdefaults-overrides)
 */
function withDefaults(defaults = undefined, ...overrides) {
  const merged = {};
  let descriptor;

  // Process defaults before overrides without allocating another array.
  for (let index = -1; index < overrides.length; index += 1) {
    const object = index === -1 ? defaults : overrides[index];
    if (object === null || object === undefined) {
      continue;
    }
    if (typeof object !== 'object') {
      throw new TypeError('Source layers must be objects, null, or undefined.');
    }

    // include symbols and check each property's current enumerability.
    for (const key of Reflect.ownKeys(object)) {
      if (!Object.prototype.propertyIsEnumerable.call(object, key)) {
        continue;
      }

      // capture accessor values once so checking and copying cannot diverge.
      const value = object[key];
      if (value !== undefined) {
        // a new key with no inherited property, or an own writable data
        // property created by this call, can be assigned without a descriptor.
        // Recheck after reading the value: a source getter may change prototypes.
        if (!(key in merged) || Object.prototype.hasOwnProperty.call(merged, key)) {
          merged[key] = value;
        } else {
          // Preserve protection against __proto__, inherited setters/read-only
          // properties, and inherited get/set fields on the descriptor itself.
          // Allocate only on the uncommon path; reuse within this call, never
          // across calls (getters may reenter, and inputs must not be retained).
          if (descriptor === undefined) {
            descriptor = {
              value: undefined,
              enumerable: true,
              writable: true,
              configurable: true
            };
          }
          descriptor.value = value;
          // `in` does not evaluate accessors. Detach only if a getter has
          // polluted descriptor fields; ordinary descriptors keep the fast path.
          if ('get' in descriptor || 'set' in descriptor) {
            Object.setPrototypeOf(descriptor, null);
          }
          Object.defineProperty(merged, key, descriptor);
        }
      }
    }
  }

  return merged;
}

module.exports = withDefaults;
