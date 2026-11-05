import { withDefaults, defaultsFor } from 'go-defaults';
import directMerge = require('go-defaults/withDefaults');
import directFactory = require('go-defaults/defaultsFor');
const configure = defaultsFor({ retries: 3 });
const directConfigure = directFactory({ retries: 3 });
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
configure(fn);
// @ts-expect-error Known invalid layers must be rejected.
configure(decorated);
// @ts-expect-error Known invalid layers must be rejected.
configure(Constructor);
// @ts-expect-error Known invalid layers must be rejected.
configure(abstractConstructor);
// @ts-expect-error Known invalid layers must be rejected.
configure(generalFunction);
// @ts-expect-error Known invalid layers must be rejected.
configure(maybeCallable);
// @ts-expect-error Known invalid layers must be rejected.
configure(false);
// @ts-expect-error Known invalid layers must be rejected.
configure(123);
// @ts-expect-error Known invalid layers must be rejected.
configure('text');
// @ts-expect-error Known invalid layers must be rejected.
configure(Symbol());
// @ts-expect-error Known invalid layers must be rejected.
configure(1n);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
configure({}, fn);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
configure(fn, {});
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
configure({}, fn, {});
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
configure(...callableArray);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
configure(...optionalCallable);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
configure(unchecked, fn);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
configure(fn, unchecked);
configure(null, undefined, optional);
configure(opaque);
configure(unchecked);
const configureValid = configure({ retries: 3 }, { retries: undefined, callback: fn });
const configureNumber: number = configureValid.retries;
const configureCallback: number = configureValid.callback().retries;
// @ts-expect-error Known invalid layers must be rejected.
directConfigure(fn);
// @ts-expect-error Known invalid layers must be rejected.
directConfigure(decorated);
// @ts-expect-error Known invalid layers must be rejected.
directConfigure(Constructor);
// @ts-expect-error Known invalid layers must be rejected.
directConfigure(abstractConstructor);
// @ts-expect-error Known invalid layers must be rejected.
directConfigure(generalFunction);
// @ts-expect-error Known invalid layers must be rejected.
directConfigure(maybeCallable);
// @ts-expect-error Known invalid layers must be rejected.
directConfigure(false);
// @ts-expect-error Known invalid layers must be rejected.
directConfigure(123);
// @ts-expect-error Known invalid layers must be rejected.
directConfigure('text');
// @ts-expect-error Known invalid layers must be rejected.
directConfigure(Symbol());
// @ts-expect-error Known invalid layers must be rejected.
directConfigure(1n);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
directConfigure({}, fn);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
directConfigure(fn, {});
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
directConfigure({}, fn, {});
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
directConfigure(...callableArray);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
directConfigure(...optionalCallable);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
directConfigure(unchecked, fn);
// @ts-expect-error Invalid branches remain rejected in layered and spread calls.
directConfigure(fn, unchecked);
directConfigure(null, undefined, optional);
directConfigure(opaque);
directConfigure(unchecked);
const directConfigureValid = directConfigure({ retries: 3 }, { retries: undefined, callback: fn });
const directConfigureNumber: number = directConfigureValid.retries;
const directConfigureCallback: number = directConfigureValid.callback().retries;
// @ts-expect-error An explicit tuple cannot admit a function layer.
withDefaults<[typeof fn]>(fn);
// @ts-expect-error An explicit single override cannot admit a function layer.
configure<typeof fn>(fn);
// @ts-expect-error An explicit override tuple cannot admit a function layer.
configure<[{}, typeof fn]>({}, fn);
const explicitSingle: string = configure<{ retries: string }>({ retries: 'off' }).retries;
const explicitTuple: string = configure<[{ retries: string }]>({ retries: 'off' }).retries;
const tuple = [{ extra: true }, { retries: 'off' }] as const;
const tupleResult: 'off' = configure(...tuple).retries;
declare const recordArray: Array<{ retries: number }>;
withDefaults(...recordArray);
configure(...recordArray);
declare const optionalRecord: [layer?: { retries: number }];
withDefaults(...optionalRecord);
configure(...optionalRecord);
withDefaults([]);
configure(new Date());

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
configure(...tupleUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
configure(...layeredUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
configure(...trailingUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
configure(...optionalUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
configure(...anyTupleUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
configure(...arrayUnion);
// @ts-expect-error A dynamic any spread cannot hide a known trailing function.
configure(...anyArray, fn);
// @ts-expect-error A dynamic any spread cannot hide a known leading function.
configure(fn, ...anyArray);
configure(...validTupleUnion);
configure(...nullishTupleUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
directConfigure(...tupleUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
directConfigure(...layeredUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
directConfigure(...trailingUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
directConfigure(...optionalUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
directConfigure(...anyTupleUnion);
// @ts-expect-error A valid tuple branch cannot hide another branch containing a function.
directConfigure(...arrayUnion);
// @ts-expect-error A dynamic any spread cannot hide a known trailing function.
directConfigure(...anyArray, fn);
// @ts-expect-error A dynamic any spread cannot hide a known leading function.
directConfigure(fn, ...anyArray);
directConfigure(...validTupleUnion);
directConfigure(...nullishTupleUnion);

// An object-constrained generic can still be instantiated with a decorated function.
function forwardGeneric<Layer extends object>(layer: Layer) {
  // @ts-expect-error The generic constraint does not establish a non-callable layer.
  withDefaults(layer);
  // @ts-expect-error The reusable function has the same conservative boundary.
  configure(layer);
  return withDefaults(layer as object);
}
function forwardDictionary<Layer extends Record<string, unknown>>(layer: Layer) {
  // @ts-expect-error A dictionary intersection can still carry a call signature.
  directMerge(layer);
  return directConfigure(layer as object);
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
configure(shadowApply);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
configure(shadowCall);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
configure(shadowBind);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
configure(shadowAbstract);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
configure(shadowUnion);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
directConfigure(shadowApply);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
directConfigure(shadowCall);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
directConfigure(shadowBind);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
directConfigure(shadowAbstract);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
directConfigure(shadowUnion);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
defaultsFor(shadowApply);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
defaultsFor(shadowCall);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
defaultsFor(shadowBind);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
defaultsFor(shadowAbstract);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
defaultsFor(shadowUnion);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
directFactory(shadowApply);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
directFactory(shadowCall);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
directFactory(shadowBind);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
directFactory(shadowAbstract);
// @ts-expect-error A call/construct signature remains invalid when Function members are shadowed.
directFactory(shadowUnion);
// @ts-expect-error A tuple union cannot hide a constructor with shadowed Function members.
withDefaults(...shadowTuples);
const withDefaultsPlainMethods = withDefaults({ call: 1, apply: 2, bind: 3 });
const withDefaultsPlainApply: number = withDefaultsPlainMethods.apply;
// @ts-expect-error A tuple union cannot hide a constructor with shadowed Function members.
directMerge(...shadowTuples);
const directMergePlainMethods = directMerge({ call: 1, apply: 2, bind: 3 });
const directMergePlainApply: number = directMergePlainMethods.apply;
// @ts-expect-error A tuple union cannot hide a constructor with shadowed Function members.
configure(...shadowTuples);
const configurePlainMethods = configure({ call: 1, apply: 2, bind: 3 });
const configurePlainApply: number = configurePlainMethods.apply;
// @ts-expect-error A tuple union cannot hide a constructor with shadowed Function members.
directConfigure(...shadowTuples);
const directConfigurePlainMethods = directConfigure({ call: 1, apply: 2, bind: 3 });
const directConfigurePlainApply: number = directConfigurePlainMethods.apply;
