import type { Merged, MergedWithFilteredOverrides, MergeSource, SourceGuard, SourceGuards } from './_merge.cjs';
import withDefaults = require('./withDefaults.cjs');

type FallbackPredicate = (value: unknown, key: string | symbol) => boolean;
type MergerOptions = {
  mergeDepth?: number | undefined;
  shouldFallback?: FallbackPredicate | undefined;
};
type PrimitiveValue = string | number | boolean | bigint | symbol | null | undefined;

type MergeResult<Sources extends readonly MergeSource[], CustomRule extends boolean> = CustomRule extends true
  ? MergedWithFilteredOverrides<Sources>
  : Merged<Sources>;

// Branded primitives can satisfy `object` in TypeScript but stay scalar at runtime.
// Widen values that could contain objects whose shape changes during a nested merge.
type NestedResult<Result> = {
  [Key in keyof Result]: [Extract<Exclude<Result[Key], PrimitiveValue>, object>] extends [never]
    ? Result[Key]
    : unknown;
};

type ResultAtDepth<
  Sources extends readonly MergeSource[],
  CustomRule extends boolean,
  Nested extends boolean
> = Nested extends true ? NestedResult<MergeResult<Sources, CustomRule>> : MergeResult<Sources, CustomRule>;

type DefaultsMerger<CustomRule extends boolean, Nested extends boolean> = {
  <Defaults extends MergeSource, Overrides extends readonly MergeSource[]>(
    defaults: Defaults & SourceGuard<Defaults>,
    ...overrides: Overrides & SourceGuards<Overrides>
  ): ResultAtDepth<[Defaults, ...Overrides], CustomRule, Nested>;
  <Sources extends readonly MergeSource[]>(
    ...sources: Sources & SourceGuards<Sources>
  ): ResultAtDepth<Sources, CustomRule, Nested>;
};

/**
 * Creates a reusable function that merges objects with your defaults rules.
 * Pass defaults followed by overrides on each call. The default merge is shallow
 * and falls back only for `undefined` values.
 * @see [Full API documentation](../docs/API.md#createdefaultsmergeroptions)
 */
declare function createDefaultsMerger(options?: undefined): typeof withDefaults;

// An optional or missing property in the options type can hide a runtime setting.
// A required property with a known value establishes that setting independently.
declare function createDefaultsMerger(options: {
  mergeDepth: 0 | undefined;
  shouldFallback: undefined;
}): typeof withDefaults;

declare function createDefaultsMerger(
  options: MergerOptions & { mergeDepth: 0 | undefined }
): DefaultsMerger<true, false>;

declare function createDefaultsMerger(
  options: MergerOptions & { shouldFallback: undefined }
): DefaultsMerger<false, true>;

declare function createDefaultsMerger(options: MergerOptions | undefined): DefaultsMerger<true, true>;

export = createDefaultsMerger;
