import type { Merged, MergeSource, NonFunctionSource, NonFunctionSources } from './_merge.cjs';

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
 * For native instances, result properties may be typed as `unknown` because TypeScript cannot
 * establish which properties are own and enumerable. Widen other class instances to `object`.
 *
 * @param defaultValues The defaults object to reuse. Required; must be an object other
 * than `null`. Functions are rejected.
 * @returns A function accepting zero or more override objects. Each call returns a new object
 * with the defaults applied; nested values retain their original references.
 * @throws {TypeError} The defaults are missing, `null`, `undefined` or not an object. Rejected
 * values are not coerced or invoked.
 * @throws Calls to the returned function follow the validation and error rules of `withDefaults`,
 * including getter and proxy errors and processing arguments in order.
 * @see [Full API documentation](../docs/API.md#defaultsfordefaultvalues)
 */
declare function defaultsFor<Defaults extends object>(
  defaultValues: Defaults & NonFunctionSource<Defaults>
): {
  (): Merged<[Defaults]>;
  // preserve the existing explicit one-override generic and require its value.
  <Values extends MergeSource>(values: Values & NonFunctionSource<Values>): Merged<[Defaults, Values]>;
  // tuples retain ordered override inference; dynamic arrays stay conservative.
  <Sources extends readonly MergeSource[]>(
    ...values: Sources & NonFunctionSources<Sources>
  ): Merged<[Defaults, ...Sources]>;
};

export = defaultsFor;
