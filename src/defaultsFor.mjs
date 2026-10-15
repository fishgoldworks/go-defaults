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
 * @see [Full API documentation](../docs/API.md#defaultsfordefaultvalues)
 */
import defaultsFor from './defaultsFor.cjs';
export { defaultsFor };
export default defaultsFor;
