import { defaultIf, withDefaults, createDefaultsMerger } from 'go-defaults';
import directMerge = require('go-defaults/withDefaults');
import directFactory = require('go-defaults/createDefaultsMerger');
const configure = createDefaultsMerger();
const directConfigure = directFactory();
const retryDefaults = { retries: 3 };
const fn = () => ({ retries: 5 });
const decorated = Object.assign(fn, { enabled: true });

class Constructor {}
declare const abstractConstructor: abstract new () => object;
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- Test the broad built-in Function boundary.
declare const generalFunction: Function;
declare const maybeCallable: { retries: number } | (() => { retries: number });
declare const callableArray: Array<{ retries: number } | typeof fn>;
declare const optionalCallable: [first?: typeof fn];
declare const opaque: object;
declare const unchecked: any;
declare const optional: { retries?: number } | null | undefined;
// @ts-expect-error Known invalid layers must be rejected.
withDefaults(fn);
// @ts-expect-error Known invalid layers must be rejected.
withDefaults(decorated);
// @ts-expect-error Known invalid layers must be rejected.
withDefaults(Constructor);
// @ts-expect-error Known invalid layers must be rejected.
withDefaults(abstractConstructor);
// @ts-expect-error Known invalid layers must be rejected.
withDefaults(generalFunction);
// @ts-expect-error Known invalid layers must be rejected.
withDefaults(maybeCallable);
// @ts-expect-error Known invalid layers must be rejected.
withDefaults(false);
// @ts-expect-error Known invalid layers must be rejected.
withDefaults(123);
// @ts-expect-error Known invalid layers must be rejected.
withDefaults('text');
// @ts-expect-error Known invalid layers must be rejected.
withDefaults(Symbol());
// @ts-expect-error Known invalid layers must be rejected.
withDefaults(1n);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
withDefaults({}, fn);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
withDefaults(fn, {});
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
withDefaults({}, fn, {});
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
withDefaults(...callableArray);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
withDefaults(...optionalCallable);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
withDefaults(unchecked, fn);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
withDefaults(fn, unchecked);
withDefaults(null, undefined, optional);
withDefaults(opaque);
withDefaults(unchecked);
const withDefaultsValid = withDefaults({ retries: 3 }, { retries: undefined, callback: fn });
const withDefaultsNumber: number = withDefaultsValid.retries;
const withDefaultsCallback: number = withDefaultsValid.callback().retries;

// @ts-expect-error Known invalid layers must be rejected.
directMerge(fn);
// @ts-expect-error Known invalid layers must be rejected.
directMerge(decorated);
// @ts-expect-error Known invalid layers must be rejected.
directMerge(Constructor);
// @ts-expect-error Known invalid layers must be rejected.
directMerge(abstractConstructor);
// @ts-expect-error Known invalid layers must be rejected.
directMerge(generalFunction);
// @ts-expect-error Known invalid layers must be rejected.
directMerge(maybeCallable);
// @ts-expect-error Known invalid layers must be rejected.
directMerge(false);
// @ts-expect-error Known invalid layers must be rejected.
directMerge(123);
// @ts-expect-error Known invalid layers must be rejected.
directMerge('text');
// @ts-expect-error Known invalid layers must be rejected.
directMerge(Symbol());
// @ts-expect-error Known invalid layers must be rejected.
directMerge(1n);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
directMerge({}, fn);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
directMerge(fn, {});
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
directMerge({}, fn, {});
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
directMerge(...callableArray);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
directMerge(...optionalCallable);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
directMerge(unchecked, fn);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
directMerge(fn, unchecked);
directMerge(null, undefined, optional);
directMerge(opaque);
directMerge(unchecked);
const directMergeValid = directMerge({ retries: 3 }, { retries: undefined, callback: fn });
const directMergeNumber: number = directMergeValid.retries;
const directMergeCallback: number = directMergeValid.callback().retries;

// @ts-expect-error Known invalid layers must be rejected.
configure(retryDefaults, fn);
// @ts-expect-error Known invalid layers must be rejected.
configure(retryDefaults, decorated);
// @ts-expect-error Known invalid layers must be rejected.
configure(retryDefaults, Constructor);
// @ts-expect-error Known invalid layers must be rejected.
configure(retryDefaults, abstractConstructor);
// @ts-expect-error Known invalid layers must be rejected.
configure(retryDefaults, generalFunction);
// @ts-expect-error Known invalid layers must be rejected.
configure(retryDefaults, maybeCallable);
// @ts-expect-error Known invalid layers must be rejected.
configure(retryDefaults, false);
// @ts-expect-error Known invalid layers must be rejected.
configure(retryDefaults, 123);
// @ts-expect-error Known invalid layers must be rejected.
configure(retryDefaults, 'text');
// @ts-expect-error Known invalid layers must be rejected.
configure(retryDefaults, Symbol());
// @ts-expect-error Known invalid layers must be rejected.
configure(retryDefaults, 1n);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
configure(retryDefaults, {}, fn);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
configure(retryDefaults, fn, {});
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
configure(retryDefaults, {}, fn, {});
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
configure(retryDefaults, ...callableArray);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
configure(retryDefaults, ...optionalCallable);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
configure(retryDefaults, unchecked, fn);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
configure(retryDefaults, fn, unchecked);
configure(retryDefaults, null, undefined, optional);
configure(retryDefaults, opaque);
configure(retryDefaults, unchecked);
const configureValid = configure(retryDefaults, { retries: 3 }, { retries: undefined, callback: fn });
const configureNumber: number = configureValid.retries;
const configureCallback: number = configureValid.callback().retries;

// @ts-expect-error Known invalid layers must be rejected.
directConfigure(retryDefaults, fn);
// @ts-expect-error Known invalid layers must be rejected.
directConfigure(retryDefaults, decorated);
// @ts-expect-error Known invalid layers must be rejected.
directConfigure(retryDefaults, Constructor);
// @ts-expect-error Known invalid layers must be rejected.
directConfigure(retryDefaults, abstractConstructor);
// @ts-expect-error Known invalid layers must be rejected.
directConfigure(retryDefaults, generalFunction);
// @ts-expect-error Known invalid layers must be rejected.
directConfigure(retryDefaults, maybeCallable);
// @ts-expect-error Known invalid layers must be rejected.
directConfigure(retryDefaults, false);
// @ts-expect-error Known invalid layers must be rejected.
directConfigure(retryDefaults, 123);
// @ts-expect-error Known invalid layers must be rejected.
directConfigure(retryDefaults, 'text');
// @ts-expect-error Known invalid layers must be rejected.
directConfigure(retryDefaults, Symbol());
// @ts-expect-error Known invalid layers must be rejected.
directConfigure(retryDefaults, 1n);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
directConfigure(retryDefaults, {}, fn);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
directConfigure(retryDefaults, fn, {});
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
directConfigure(retryDefaults, {}, fn, {});
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
directConfigure(retryDefaults, ...callableArray);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
directConfigure(retryDefaults, ...optionalCallable);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
directConfigure(retryDefaults, unchecked, fn);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
directConfigure(retryDefaults, fn, unchecked);
directConfigure(retryDefaults, null, undefined, optional);
directConfigure(retryDefaults, opaque);
directConfigure(retryDefaults, unchecked);
const directConfigureValid = directConfigure(retryDefaults, { retries: 3 }, { retries: undefined, callback: fn });
const directConfigureNumber: number = directConfigureValid.retries;
const directConfigureCallback: number = directConfigureValid.callback().retries;

// @ts-expect-error An explicit tuple cannot admit a function layer.
withDefaults<[typeof fn]>(fn);
// @ts-expect-error An explicit single override cannot admit a function layer.
configure<[{ retries: number }, typeof fn]>(retryDefaults, fn);
// @ts-expect-error An explicit override tuple cannot admit a function layer.
configure<[{ retries: number }, {}, typeof fn]>(retryDefaults, {}, fn);
const explicitTuple: string = configure<[{ retries: number }, { retries: string }]>(
  { retries: 3 },
  { retries: 'off' }
).retries;
const tuple = [{ extra: true }, { retries: 'off' }] as const;
const tupleResult: 'off' = configure(retryDefaults, ...tuple).retries;

declare const recordArray: Array<{ retries: number }>;
withDefaults(...recordArray);
configure(retryDefaults, ...recordArray);
declare const optionalRecord: [layer?: { retries: number }];
withDefaults(...optionalRecord);
configure(retryDefaults, ...optionalRecord);
withDefaults([]);
configure(retryDefaults, new Date());

declare const tupleUnion: [{ retries: number }] | [typeof fn];
declare const layeredUnion: [{ retries: number }, {}] | [typeof fn, {}];
declare const trailingUnion: [{}, { retries: number }] | [{}, typeof fn];
declare const optionalUnion: [layer?: { retries: number }] | [layer?: typeof fn];
declare const anyTupleUnion: [any, { retries: number }] | [any, typeof fn];
declare const arrayUnion: Array<{ retries: number }> | Array<typeof fn>;
declare const anyArray: any[];
declare const validTupleUnion: [{ retries: number }] | [{ retries: string }];
declare const nullishTupleUnion: [null] | [undefined] | [{ retries: number }];
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
withDefaults(...tupleUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
withDefaults(...layeredUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
withDefaults(...trailingUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
withDefaults(...optionalUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
withDefaults(...anyTupleUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
withDefaults(...arrayUnion);
// @ts-expect-error A dynamic any spread cannot hide a known trailing function.
withDefaults(...anyArray, fn);
// @ts-expect-error A dynamic any spread cannot hide a known leading function.
withDefaults(fn, ...anyArray);
withDefaults(...validTupleUnion);
withDefaults(...nullishTupleUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
directMerge(...tupleUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
directMerge(...layeredUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
directMerge(...trailingUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
directMerge(...optionalUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
directMerge(...anyTupleUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
directMerge(...arrayUnion);
// @ts-expect-error A dynamic any spread cannot hide a known trailing function.
directMerge(...anyArray, fn);
// @ts-expect-error A dynamic any spread cannot hide a known leading function.
directMerge(fn, ...anyArray);
directMerge(...validTupleUnion);
directMerge(...nullishTupleUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
configure(retryDefaults, ...tupleUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
configure(retryDefaults, ...layeredUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
configure(retryDefaults, ...trailingUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
configure(retryDefaults, ...optionalUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
configure(retryDefaults, ...anyTupleUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
configure(retryDefaults, ...arrayUnion);
// @ts-expect-error A dynamic any spread cannot hide a known trailing function.
configure(retryDefaults, ...anyArray, fn);
// @ts-expect-error A dynamic any spread cannot hide a known leading function.
configure(retryDefaults, fn, ...anyArray);
configure(retryDefaults, ...validTupleUnion);
configure(retryDefaults, ...nullishTupleUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
directConfigure(retryDefaults, ...tupleUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
directConfigure(retryDefaults, ...layeredUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
directConfigure(retryDefaults, ...trailingUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
directConfigure(retryDefaults, ...optionalUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
directConfigure(retryDefaults, ...anyTupleUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
directConfigure(retryDefaults, ...arrayUnion);
// @ts-expect-error A dynamic any spread cannot hide a known trailing function.
directConfigure(retryDefaults, ...anyArray, fn);
// @ts-expect-error A dynamic any spread cannot hide a known leading function.
directConfigure(retryDefaults, fn, ...anyArray);
directConfigure(retryDefaults, ...validTupleUnion);
directConfigure(retryDefaults, ...nullishTupleUnion);

// An object-constrained generic can still be instantiated with a decorated function.
function forwardGeneric<Layer extends object>(layer: Layer) {
  // @ts-expect-error The generic constraint does not establish a non-callable layer.
  withDefaults(layer);
  // @ts-expect-error The reusable function has the same conservative boundary.
  configure(retryDefaults, layer);

  return withDefaults(layer as object);
}

function forwardDictionary<Layer extends Record<string, unknown>>(layer: Layer) {
  // @ts-expect-error A dictionary intersection can still carry a call signature.
  directMerge(layer);

  return directConfigure(retryDefaults, layer as object);
}

function mergeGenericProperty<Value>(value: Value) {
  return withDefaults({ value }, { enabled: true });
}

const genericProperty: string = mergeGenericProperty('text').value;
const genericCallback: () => number = mergeGenericProperty(() => 1).value;
const genericFlag: boolean = mergeGenericProperty(1).enabled;

const shadowApply: { (): number; apply: number } = Object.assign(() => 1, { apply: 123 });
const shadowCall: { (value: string): number; call: number } = Object.assign((value: string) => value.length, {
  call: 123
});
const shadowBind: { new (): object; bind: number } = Object.assign(class Example {}, { bind: 123 });

declare const shadowAbstract: (abstract new (value: string) => object) & { apply: number };
declare const shadowUnion: { retries: number } | typeof shadowApply;
declare const shadowTuples: [{ retries: number }] | [typeof shadowBind];
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
withDefaults(shadowApply);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
withDefaults(shadowCall);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
withDefaults(shadowBind);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
withDefaults(shadowAbstract);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
withDefaults(shadowUnion);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
directMerge(shadowApply);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
directMerge(shadowCall);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
directMerge(shadowBind);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
directMerge(shadowAbstract);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
directMerge(shadowUnion);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
configure(retryDefaults, shadowApply);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
configure(retryDefaults, shadowCall);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
configure(retryDefaults, shadowBind);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
configure(retryDefaults, shadowAbstract);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
configure(retryDefaults, shadowUnion);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
directConfigure(retryDefaults, shadowApply);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
directConfigure(retryDefaults, shadowCall);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
directConfigure(retryDefaults, shadowBind);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
directConfigure(retryDefaults, shadowAbstract);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
directConfigure(retryDefaults, shadowUnion);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
createDefaultsMerger()(shadowApply);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
createDefaultsMerger()(shadowCall);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
createDefaultsMerger()(shadowBind);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
createDefaultsMerger()(shadowAbstract);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
createDefaultsMerger()(shadowUnion);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
directFactory()(shadowApply);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
directFactory()(shadowCall);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
directFactory()(shadowBind);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
directFactory()(shadowAbstract);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
directFactory()(shadowUnion);
// @ts-expect-error A tuple union cannot hide a constructor with shadowed Function members.
withDefaults(...shadowTuples);
const withDefaultsPlainMethods = withDefaults({ call: 1, apply: 2, bind: 3 });
const withDefaultsPlainApply: number = withDefaultsPlainMethods.apply;

// @ts-expect-error A tuple union cannot hide a constructor with shadowed Function members.
directMerge(...shadowTuples);
const directMergePlainMethods = directMerge({ call: 1, apply: 2, bind: 3 });
const directMergePlainApply: number = directMergePlainMethods.apply;

// @ts-expect-error A tuple union cannot hide a constructor with shadowed Function members.
configure(retryDefaults, ...shadowTuples);
const configurePlainMethods = configure(retryDefaults, { call: 1, apply: 2, bind: 3 });
const configurePlainApply: number = configurePlainMethods.apply;

// @ts-expect-error A tuple union cannot hide a constructor with shadowed Function members.
directConfigure(retryDefaults, ...shadowTuples);
const directConfigurePlainMethods = directConfigure(retryDefaults, { call: 1, apply: 2, bind: 3 });
const directConfigurePlainApply: number = directConfigurePlainMethods.apply;

declare const scalarBrand: unique symbol;

type BrandedScalar<Value> = Value & { readonly [scalarBrand]: 'scalar' };

declare const brandedText: BrandedScalar<string>;
declare const brandedNumber: BrandedScalar<number>;
declare const brandedBoolean: BrandedScalar<boolean>;
declare const brandedBigInt: BrandedScalar<bigint>;
declare const brandedSymbol: BrandedScalar<symbol>;
declare const brandedScalar:
  typeof brandedText | typeof brandedNumber | typeof brandedBoolean | typeof brandedBigInt | typeof brandedSymbol;
declare const brandedUnion: typeof brandedText | { retries: number };
declare const optionalBranded: [first?: typeof brandedText];
declare const brandedArray: Array<typeof brandedText | { retries: number }>;
// @ts-expect-error A branded string remains an invalid primitive source layer.
withDefaults(brandedText);
// @ts-expect-error A branded number remains an invalid primitive source layer.
withDefaults(brandedNumber);
// @ts-expect-error A branded boolean remains an invalid primitive source layer.
withDefaults(brandedBoolean);
// @ts-expect-error A branded bigint remains an invalid primitive source layer.
withDefaults(brandedBigInt);
// @ts-expect-error A branded symbol remains an invalid primitive source layer.
withDefaults(brandedSymbol);
// @ts-expect-error A later layer cannot contain a branded primitive.
withDefaults({}, brandedScalar);
// @ts-expect-error A trailing object cannot hide an invalid earlier layer.
withDefaults(brandedScalar, {});
// @ts-expect-error Tuple spreads retain known invalid primitive layers.
withDefaults(...([{}, brandedScalar] as const));
// @ts-expect-error An ordinary record branch cannot hide an invalid primitive branch.
withDefaults(brandedUnion);
// @ts-expect-error Optional tuples retain invalid primitive branches.
withDefaults(...optionalBranded);
// @ts-expect-error Dynamic arrays retain known invalid primitive branches.
withDefaults(...brandedArray);
// @ts-expect-error An unchecked layer cannot hide a separate known invalid primitive.
withDefaults(unchecked, brandedText);
// @ts-expect-error An unchecked layer cannot hide a separate known invalid primitive.
withDefaults(brandedText, unchecked);
// @ts-expect-error Focused imports use the same source guard.
directMerge(brandedScalar);
// @ts-expect-error A factory requires object defaults, including for branded scalars.
createDefaultsMerger()(brandedScalar);
// @ts-expect-error A focused factory requires object defaults.
directFactory()(brandedScalar);
// @ts-expect-error Returned functions reject branded primitive overrides.
configure(retryDefaults, brandedScalar);
// @ts-expect-error Returned functions reject invalid optional tuple members.
configure(retryDefaults, ...optionalBranded);
// @ts-expect-error Returned functions reject invalid unbounded array members.
configure(retryDefaults, ...brandedArray);
// @ts-expect-error Focused returned functions share the same source guards.
directConfigure(retryDefaults, brandedScalar);

const brandedRecord = withDefaults({ id: brandedText, count: brandedNumber, [scalarBrand]: 'record' as const });
const retainedId: typeof brandedText = brandedRecord.id;
const retainedCount: typeof brandedNumber = brandedRecord.count;
const retainedBrand: 'record' = brandedRecord[scalarBrand];
const selectedBrand: typeof brandedText = defaultIf(brandedText, null);
const configuredBrand: typeof brandedSymbol = createDefaultsMerger()(
  { id: brandedSymbol },
  {
    id: undefined
  }
).id;

// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types -- The wrapper object must remain a valid layer.
declare const symbolWrapper: Symbol;
// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types -- The wrapper object must remain a valid layer.
declare const bigIntWrapper: BigInt;
withDefaults(new String('text'), new Number(7), new Boolean(true), symbolWrapper, bigIntWrapper);
createDefaultsMerger()(new String('text'), new Number(7), new Boolean(true), symbolWrapper, bigIntWrapper);
