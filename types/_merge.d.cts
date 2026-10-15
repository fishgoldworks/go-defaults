/** Internal declarations shared by the two default-merging helpers. */
export type MergeSource = object | null | undefined;

// Unknown inputs may overwrite built-in or consumer-added Object members.
// Extending the mapped members makes them explicitly unknown on older compilers;
// a Record intersection can leave inherited methods incorrectly callable.
interface UnknownRecord extends Record<keyof Object, unknown> {
  [key: string]: unknown;
  [key: number]: unknown;
  [key: symbol]: unknown;
}
// A template-pattern index signature is open too, even when it is combined with
// finite named keys. Finite literal template expansions are not open keys.
type OpenKey<Key extends PropertyKey> = Key extends unknown ? ({} extends Record<Key, never> ? true : false) : never;
type IsAny<Value> = 0 extends 1 & Value ? true : false;

// TypeScript's object constraint includes functions. Reject known callable or
// constructable branches without changing ordinary record inference. Broad object
// and any inputs still need runtime validation; any in one layer must not mask
// a known function in a different layer.
// Explicit signatures also catch functions that overwrite Function members such
// as call, apply or bind with incompatible property types.
type FunctionSource = Function | ((...args: never[]) => unknown) | (abstract new (...args: never[]) => unknown);

export type NonFunctionSource<Source> = unknown extends Source
  ? unknown
  : [Extract<Source, FunctionSource>] extends [never]
    ? unknown
    : never;

// Collect invalid members before deciding whether the entire argument list is
// valid. Returning per-position unknown guards would let a valid tuple branch
// mask a function in another branch of an equal-length tuple union.
// Preserve known leading/trailing layers around an unbounded spread. Older
// compilers can lose those positions when a mapped tuple is indexed by number.
type InvalidFunction<Source> = unknown extends Source ? never : Extract<Source, FunctionSource>;
// Accumulate invalid members so long tuples can use tail-recursion elimination.
type DynamicFunctionLayers<Sources extends readonly MergeSource[], Invalid = never> = Sources extends readonly [
  ...infer Rest,
  infer Last
]
  ? DynamicFunctionLayers<Extract<Rest, readonly MergeSource[]>, Invalid | InvalidFunction<Last>>
  : Sources extends readonly [infer First, ...infer Rest]
    ? DynamicFunctionLayers<Extract<Rest, readonly MergeSource[]>, Invalid | InvalidFunction<First>>
    : Invalid | InvalidFunction<Sources[number]>;
type FunctionLayers<Sources extends readonly MergeSource[]> = number extends Sources['length']
  ? DynamicFunctionLayers<Sources>
  : {
      [Index in keyof Sources]-?: unknown extends Sources[Index] ? never : Extract<Sources[Index], FunctionSource>;
    }[number];

export type NonFunctionSources<Sources extends readonly MergeSource[]> = [FunctionLayers<Sources>] extends [never]
  ? unknown
  : never;

// JavaScript treats a numeric key and its canonical string spelling as
// one property. Remapping also preserves optional/readonly flags on the source.
type CanonicalRecord<Source> = {
  [Key in keyof Source as Key extends number ? `${Key}` : Key]: Source[Key];
};

// These native instances expose typed prototype methods/accessors but their internals
// and inherited members are NOT copied by the own-enumerable runtime merge. They
// can also carry added enumerable properties, so an unknown record (not {}) is safe.
// Later globals are optional in consumer libs; do not require ES2021+ declarations.
// This cannot detect every user class or structural Error without also masking
// common plain data records; those still require an explicit `object` widening.
type OptionalGlobalInstance<Name extends string> = Name extends keyof typeof globalThis
  ? (typeof globalThis)[Name] extends { prototype: infer Instance }
    ? Instance
    : never
  : never;
type NativeInstance =
  | Date
  | RegExp
  | Number
  | Boolean
  | OptionalGlobalInstance<'Map'>
  | OptionalGlobalInstance<'Set'>
  | OptionalGlobalInstance<'WeakMap'>
  | OptionalGlobalInstance<'WeakSet'>
  | OptionalGlobalInstance<'Promise'>
  | OptionalGlobalInstance<'ArrayBuffer'>
  | OptionalGlobalInstance<'DataView'>
  | OptionalGlobalInstance<'SharedArrayBuffer'>
  | OptionalGlobalInstance<'WeakRef'>
  | OptionalGlobalInstance<'FinalizationRegistry'>;

// Open dictionaries, arrays and opaque object types cannot promise that keys
// are own/enumerable or even present. Functions cannot contribute properties to a
// successful merge: the public signatures and runtime validation reject them.
// Distribute unions first and capture each branch's keys before narrowing it.
// Older compilers can otherwise widen keyof for records such as { toString: undefined }.
type Normalized<Source> = Source extends unknown ? NormalizeSource<Source> : never;

type NormalizeSource<Source, Keys extends PropertyKey = keyof Source> =
  IsAny<Source> extends true
    ? UnknownRecord
    : Source extends null | undefined
      ? {}
      : Source extends Function
        ? {}
        : Source extends object
          ? Source extends NativeInstance
            ? UnknownRecord
            : string extends Keys
              ? UnknownRecord
              : number extends Keys
                ? UnknownRecord
                : symbol extends Keys
                  ? UnknownRecord
                  : true extends OpenKey<Keys>
                    ? UnknownRecord
                    : [Keys] extends [never]
                      ? string extends Source
                        ? {}
                        : UnknownRecord
                      : CanonicalRecord<Source>
          : {};

type NormalizeSources<Sources extends readonly MergeSource[]> = {
  [Index in keyof Sources]: Normalized<Sources[Index]>;
};
type KeysOfUnion<Value> = Value extends unknown ? keyof Value : never;
type DefinedAt<Source, Key extends PropertyKey> = Source extends unknown
  ? Key extends keyof Source
    ? Exclude<Source[Key], undefined>
    : never
  : never;

// Distribute only inside a single property lookup, not across every whole-object
// combination. A key is guaranteed only if EVERY branch must copy its value.
type MaySkip<Source, Key extends PropertyKey> = Source extends unknown
  ? Key extends keyof Source
    ? {} extends Pick<Source, Key>
      ? true
      : undefined extends Source[Key]
        ? true
        : false
    : true
  : never;

// results have an ordinary prototype. When every source skips a
// prototype-named field, reading it exposes the inherited member, not undefined.
// Optional legacy names use unknown instead of promising host-specific support.
type MissingState<Key extends PropertyKey, Value> = Key extends keyof Object
  ? [Value | Object[Key], true]
  : Key extends '__proto__' | '__defineGetter__' | '__defineSetter__' | '__lookupGetter__' | '__lookupSetter__'
    ? [unknown, false]
    : [Value, false];

// Scan right-to-left and stop once a source guarantees the key. Earlier values
// cannot affect that property, so they need not be instantiated at all.
type PropertyState<
  Sources extends readonly unknown[],
  Key extends PropertyKey,
  Value = never
> = Sources extends readonly [...infer Rest, infer Last]
  ? true extends MaySkip<Last, Key>
    ? PropertyState<Rest, Key, Value | DefinedAt<Last, Key>>
    : [Value | DefinedAt<Last, Key>, true]
  : MissingState<Key, Value>;

type PropertyStates<Sources extends readonly unknown[]> = {
  [Key in KeysOfUnion<Sources[number]>]: PropertyState<Sources, Key>;
};
type Simplify<Value> = { [Key in keyof Value]: Value[Key] };
type FromStates<States extends Record<PropertyKey, [unknown, boolean]>> = Simplify<
  {
    -readonly [
      Key in keyof States as [States[Key][0]] extends [never] ? never : States[Key][1] extends true ? Key : never
    ]-?: States[Key][0];
  } & {
    -readonly [
      Key in keyof States as [States[Key][0]] extends [never] ? never : States[Key][1] extends true ? never : Key
    ]?: States[Key][0];
  }
>;

// bound compile-time work, not runtime inputs. Dynamic/optional tuples
// and more than 64 sources get a safe unknown-valued result instead of TS2589.
type WithinBudget<Sources extends readonly unknown[], Count extends unknown[] = []> = number extends Sources['length']
  ? false
  : Sources extends readonly []
    ? true
    : Count['length'] extends 64
      ? false
      : Sources extends readonly [unknown, ...infer Rest]
        ? WithinBudget<Rest, [...Count, unknown]>
        : false;

type MergeNormalized<Sources extends readonly unknown[], Keys = KeysOfUnion<Sources[number]>> = string extends Keys
  ? UnknownRecord
  : number extends Keys
    ? UnknownRecord
    : symbol extends Keys
      ? UnknownRecord
      : FromStates<PropertyStates<Sources>>;

// resolve each property against the original source tuple once. Avoid
// recursively feeding nested, computed object types into another merge.
export type Merged<Sources extends readonly MergeSource[]> = [WithinBudget<Sources>] extends [true]
  ? MergeNormalized<NormalizeSources<Sources>>
  : UnknownRecord;
