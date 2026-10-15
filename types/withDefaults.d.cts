import type { Merged, MergeSource, NonFunctionSource, NonFunctionSources } from './_merge.cjs';

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
 * For native instances, result properties may be typed as `unknown` because TypeScript cannot
 * establish which properties are own and enumerable. Widen other class instances to `object`.
 *
 * @param defaults Optional initial defaults. `null` and `undefined` are skipped.
 * @param overrides Override objects, applied from left to right. `null` and `undefined` are skipped.
 * @returns A new plain object containing the combined properties. Nested values retain
 * their original references.
 * @throws {TypeError} An argument is not an object, `null` or `undefined`. Functions are rejected
 * without coercion or invocation. Arguments are processed in order; earlier side effects are not undone.
 * @throws Errors from source getters, proxies or reflection are passed through to the caller.
 * @see [Full API documentation](../docs/API.md#withdefaultsdefaults-overrides)
 */
declare function withDefaults<Defaults extends MergeSource, Overrides extends readonly MergeSource[]>(
  defaults: Defaults & NonFunctionSource<Defaults>,
  ...overrides: Overrides & NonFunctionSources<Overrides>
): Merged<[Defaults, ...Overrides]>;

// Preserve zero-argument calls, explicit source tuples and optional/union spreads.
declare function withDefaults<Sources extends readonly MergeSource[]>(
  ...sources: Sources & NonFunctionSources<Sources>
): Merged<Sources>;

export = withDefaults;
