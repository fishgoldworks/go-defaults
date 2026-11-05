import { defaultsFor, withDefaults } from 'go-defaults';
import directWithDefaults = require('go-defaults/withDefaults');
import directDefaultsFor = require('go-defaults/defaultsFor');
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
class ConstructOnly {}
// inferred merges model defined right-hand overrides rather than intersections.
const preserved = withDefaults({ retries: 3 }, { retries: undefined });
const retries: number = preserved.retries;
const overridden = withDefaults({ retries: 3 }, { retries: 'off' });
const stringRetries: string = overridden.retries;
const nullable = withDefaults({ retries: 3 }, { retries: null });
const nullRetries: null = nullable.retries;
const shallow = withDefaults({ nested: { a: 1 } }, { nested: { b: 'b' } });
const nestedB: string = shallow.nested.b;
// @ts-expect-error Shallow replacement does not preserve the previous nested key.
shallow.nested.a;
const missing = withDefaults({ missing: undefined });
// @ts-expect-error Undefined-only keys are not copied at runtime.
missing.missing;
declare const optional: {
  retries?: string;
  extra?: boolean;
};
const optionalMerged = withDefaults({ retries: 3 }, optional);
const optionalRetries: number | string = optionalMerged.retries;
const optionalExtra: boolean | undefined = optionalMerged.extra;
// @ts-expect-error An optional key is not guaranteed to exist.
const mandatoryExtra: boolean = optionalMerged.extra;
declare const maybeUndefined: {
  retries: string | undefined;
};
const undefinedFallback = withDefaults({ retries: 3 }, maybeUndefined);
const fallback: number | string = undefinedFallback.retries;
const optionalOnly = withDefaults(maybeUndefined);
const maybeRetry: string | undefined = optionalOnly.retries;
// @ts-expect-error A required source key can still be omitted when its value is undefined.
const definiteRetry: string = optionalOnly.retries;
const symbol = Symbol('key');
const symbols = withDefaults({ [symbol]: 1 }, { [symbol]: undefined });
const symbolNumber: number = symbols[symbol];
const mutable = withDefaults({ active: true } as const);
mutable.active = true;
const many = withDefaults({ a: 1 }, { b: true }, null, undefined, { a: 'final' });
const finalA: string = many.a;
const finalB: boolean = many.b;
declare const nullableOverride:
  | {
      retries: string;
    }
  | null
  | undefined;
const nullableMerge = withDefaults({ retries: 3 }, nullableOverride);
const nullableRetry: number | string = nullableMerge.retries;
const factory = defaultsFor({ retries: 3, active: true });
const factoryDefaults: number = factory().retries;
const factoryNull: boolean = factory(null).active;
const factoryUndefined: number = factory(undefined).retries;
const factoryOverride: string = factory({ retries: 'off' }).retries;
const factoryFallback: number = factory({ retries: undefined }).retries;
const newOption: number = factory({ newOption: 1 }).newOption;
const subpathMerge: number = directWithDefaults({ retries: 3 }, undefined).retries;
const subpathFactory: number = directDefaultsFor({ retries: 3 })().retries;
declare const dynamic: Array<{
  retries: number;
}>;
const spread = withDefaults(...dynamic);
// @ts-expect-error An unbounded array may be empty; no key is guaranteed.
const guaranteedSpread: number = spread.retries;
declare const dictionary: Record<string, number>;
const indexed = withDefaults(dictionary);
// @ts-expect-error A dictionary's index signature does not guarantee own properties.
const guaranteedIndex: number = indexed.arbitrary;
declare const opaque: object;
const uncertainOverride = withDefaults({ retries: 3 }, opaque);
// @ts-expect-error A broadly typed object can override keys with unknown values.
const uncertainNumber: number = uncertainOverride.retries;
// @ts-expect-error Primitive merge sources remain outside the typed API.
withDefaults('str');
// @ts-expect-error Defaults must be a non-null object.
defaultsFor(null);
// Explicit generics must not invent an override when no value was supplied.
// @ts-expect-error This override type requires an actual argument.
factory<{
  retries: string;
}>();
const explicitOverride: string = factory<{
  retries: string;
}>({ retries: 'off' }).retries;
// Requiredness must be retained through multiple optional/undefined overrides.
declare const optionalNumber: {
  retries?: number;
};
const lastFallback = withDefaults({ retries: 'initial' }, optionalNumber, { retries: undefined });
const lastFallbackValue: string | number = lastFallback.retries;
const optionalThenRequired = withDefaults(optionalNumber, { retries: false });
const requiredBoolean: boolean = optionalThenRequired.retries;
const allOptional = withDefaults(optionalNumber, optional);
const optionalUnion: number | string | undefined = allOptional.retries;
const emptyThenValue: number = withDefaults({}, { retries: 1 }).retries;
const tuple = [{ a: 1 }, { b: 'x' }] as const;
const tupleResult = withDefaults(...tuple);
const tupleA: 1 = tupleResult.a;
const tupleB: 'x' = tupleResult.b;
declare const dictionaryOverride: Record<string, unknown>;
// @ts-expect-error Unknown dictionary overrides cannot preserve a known numeric type.
const dynamicOverride: number = withDefaults({ retries: 3 }, dictionaryOverride).retries;
// @ts-expect-error Runtime rejects callable defaults rather than treating them as objects.
defaultsFor(() => ({ retries: 1 }));
// @ts-expect-error Constructor functions are invalid defaults too.
defaultsFor(ConstructOnly);
declare const possiblyCallableDefaults:
  | {
      retries: number;
    }
  | (() => void);
// @ts-expect-error A union with an invalid default branch is not safe.
defaultsFor(possiblyCallableDefaults);
