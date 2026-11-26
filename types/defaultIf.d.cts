type FallbackResult<Value, Fallback> = Exclude<Value, undefined> | (undefined extends Value ? Fallback : never);

/**
 * Selects the fallback when the test returns true. The default test matches
 * only `undefined`. Both value arguments are required and may explicitly
 * be `undefined`. Selected values are returned unchanged.
 * @see [Full API documentation](../docs/API.md#defaultifvalue-fallback-predicate)
 */
declare function defaultIf<Value extends {} | null, Fallback>(
  value: Value,
  fallback: Fallback,
  predicate?: undefined
): Value;

declare function defaultIf<Value, Fallback>(
  value: Value,
  fallback: Fallback,
  predicate?: undefined
): FallbackResult<Value, Fallback>;

/**
 * Selects the fallback when the supplied predicate returns true.
 * @see [Full API documentation](../docs/API.md#defaultifvalue-fallback-predicate)
 */
declare function defaultIf<Value, Fallback>(
  value: Value,
  fallback: Fallback,
  predicate: ((value: Value) => boolean) | undefined
): Value | Fallback;

export = defaultIf;
