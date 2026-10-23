import { withDefaults, defaultsFor } from 'go-defaults';
import merge = require('go-defaults/withDefaults');
import factory = require('go-defaults/defaultsFor');
// Native instances' prototype methods/accessors are not copied as own enumerable data.
// @ts-expect-error Date methods do not survive a shallow copy.
withDefaults(new Date()).getTime();
// @ts-expect-error The factory has the same source-copying policy.
factory(new Date())().toISOString();
// @ts-expect-error Map methods are inherited and are not copied.
merge(new Map<string, number>()).get('x');
// @ts-expect-error RegExp.exec is inherited, not an own enumerable property.
withDefaults(/x/).exec('x');
// @ts-expect-error Set.has is inherited.
defaultsFor(new Set<string>())().has('x');
// @ts-expect-error Boxed Number.prototype.toFixed is not copied.
withDefaults(new Number(1)).toFixed(2);
// @ts-expect-error Boxed Boolean.valueOf returns a different type from Object.prototype.valueOf.
withDefaults(new Boolean(true)).valueOf() as boolean;
// Symbol and BigInt wrappers must not retain native methods after merging.
// @ts-expect-error Symbol.toPrimitive is not copied from the wrapper prototype.
withDefaults(Symbol.prototype)[Symbol.toPrimitive]('default');
// @ts-expect-error A Symbol wrapper used as an override does not supply a primitive valueOf result.
const unsafeSymbol: symbol = merge({ option: true }, Symbol.prototype).valueOf();
// @ts-expect-error The reusable function does not copy Symbol.toPrimitive either.
defaultsFor(Symbol.prototype)()[Symbol.toPrimitive]('default');
// @ts-expect-error Wrapper overrides follow the same rule through the focused factory.
const unsafeFactorySymbol: symbol = factory({ option: true })(Symbol.prototype).valueOf();
// @ts-expect-error The result is a plain object, not a BigInt wrapper.
const unsafeBigInt: bigint = withDefaults(BigInt.prototype).valueOf();
// @ts-expect-error BigInt wrapper overrides do not retain the native valueOf method.
const unsafeFocusedBigInt: bigint = merge({ option: true }, BigInt.prototype).valueOf();
// @ts-expect-error The reusable function also produces a plain object.
const unsafeFactoryBigInt: bigint = defaultsFor(BigInt.prototype)().valueOf();
// @ts-expect-error The focused factory must not infer a primitive from a wrapper override.
const unsafeFocusedFactoryBigInt: bigint = factory({ option: true })(BigInt.prototype).valueOf();
// @ts-expect-error Promise.then is inherited, not copied.
withDefaults(Promise.resolve(1)).then(() => 1);
// @ts-expect-error DataView.byteLength is an inherited getter, not copied.
const unsafeLength: number = withDefaults(new DataView(new ArrayBuffer(8))).byteLength;
// @ts-expect-error ArrayBuffer.slice is inherited.
withDefaults(new ArrayBuffer(8)).slice(1);
// @ts-expect-error SharedArrayBuffer.slice is inherited.
withDefaults(new SharedArrayBuffer(8)).slice(1);
// @ts-expect-error WeakMap methods are inherited.
withDefaults(new WeakMap<object, number>()).get({});
// @ts-expect-error WeakSet methods are inherited.
withDefaults(new WeakSet<object>()).has({});
// @ts-expect-error WeakRef.deref is inherited.
withDefaults(new WeakRef({})).deref();
// @ts-expect-error FinalizationRegistry.register is inherited.
withDefaults(new FinalizationRegistry<object>(() => {})).register({});
// Positive controls: plain records preserve inferred own-method types and overrides.
const own = withDefaults({ getTime: () => 3 });
const ownedFunction: number = own.getTime();
const final = withDefaults({ initial: 3 }, { current: 'yes' });
const current: string = final.current;
const factoryResult = defaultsFor({ text: 'base' })({ text: undefined });
const text: string = factoryResult.text;
const numeric: string = withDefaults({ 1: 42 }, { '1': 'last' })[1];
// Structural typing also conservatively classifies a Boolean-shaped plain object.
// @ts-expect-error This is the deliberate type-safety trade-off for boxed Booleans.
withDefaults({ valueOf: () => true }).valueOf();
// Own methods on ordinary records remain callable with their inferred result types.
const ownSymbol = Symbol('own');
const ownSymbolResult: symbol = withDefaults({ valueOf: () => ownSymbol }).valueOf();
const ownBigIntResult: bigint = defaultsFor({ valueOf: () => BigInt(7) })().valueOf();
const symbol = Symbol('option');
const symbolValue: number = merge({ [symbol]: 1 }, { [symbol]: undefined })[symbol];
