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
 * @see [Full API documentation](../docs/API.md#withdefaultsdefaults-overrides)
 */
import withDefaults from './withDefaults.cjs';
export { withDefaults };
export default withDefaults;
