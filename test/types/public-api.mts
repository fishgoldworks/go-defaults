import Defaults, { withDefaults, defaultsFor } from 'go-defaults';
import * as namespace from 'go-defaults';
import directMerge from 'go-defaults/withDefaults';
import directFactory from 'go-defaults/defaultsFor';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
type Assert<Value extends true> = Value;
type PublicKeys = Assert<Equal<keyof typeof Defaults, 'defaultsFor' | 'withDefaults'>>;
type MergeSignature = Assert<Equal<typeof Defaults.withDefaults, typeof directMerge>>;
type FactorySignature = Assert<Equal<typeof Defaults.defaultsFor, typeof directFactory>>;
type NamespaceKeys = Assert<Equal<keyof typeof namespace, 'default' | 'defaultsFor' | 'withDefaults'>>;
// @ts-expect-error The package does not expose arbitrary helper subpaths.
import unsupported from 'go-defaults/unsupported';
void unsupported;

// The full inference/rejection cases live in .cts fixtures. Both resolution branches
// must expose exactly those signatures, including named and focused imports.
import type { CommonJs } from './commonjs-signatures.cjs';
type RootMergeParity = Assert<Equal<typeof withDefaults, CommonJs['withDefaults']>>;
type RootFactoryParity = Assert<Equal<typeof defaultsFor, CommonJs['defaultsFor']>>;
type FocusedMergeParity = Assert<Equal<typeof directMerge, CommonJs['withDefaults']>>;
type FocusedFactoryParity = Assert<Equal<typeof directFactory, CommonJs['defaultsFor']>>;
import { withDefaults as namedMerge } from 'go-defaults/withDefaults';
import { defaultsFor as namedFactory } from 'go-defaults/defaultsFor';
type NamedMergeParity = Assert<Equal<typeof namedMerge, CommonJs['withDefaults']>>;
type NamedFactoryParity = Assert<Equal<typeof namedFactory, CommonJs['defaultsFor']>>;

const merged: number = withDefaults({ value: 1 }, { value: undefined }).value;
const directMerged: string = directMerge({ value: 1 }, { value: 'x' }).value;
const symbol = Symbol('option');
const symbolValue: number = namedMerge({ [symbol]: 1 })[symbol];
declare const optional: {
  value?: string;
};
const union: string | number = withDefaults({ value: 1 }, optional).value;
const shallow = withDefaults({ nested: { a: 1 } }, { nested: { b: 2 } });
// @ts-expect-error Nested values are replaced rather than intersected.
shallow.nested.a;
const apply = defaultsFor({ value: 1 });
const unchanged: number = apply().value;
const changed: string = apply({ value: 'x' }).value;
const directApplied: null = directFactory({ value: 1 })({ value: null }).value;
const namedApplied: number = namedFactory({ value: 1 })({ value: undefined }).value;
// @ts-expect-error An explicitly typed override must actually be supplied.
apply<{
  value: string;
}>();
declare const dictionary: Record<string, number>;
// @ts-expect-error Dictionaries do not guarantee enumerable own keys exist.
const unsafeIndex: number = withDefaults(dictionary).missing;
// @ts-expect-error Focused ESM imports must not retain non-enumerable Symbol methods.
directMerge(Symbol.prototype)[Symbol.toPrimitive]('default');
// @ts-expect-error A wrapper passed to the named ESM factory does not retain BigInt.valueOf.
const unsafeBigInt: bigint = namedFactory({ option: true })(BigInt.prototype).valueOf();
// @ts-expect-error ESM factory creation must reject callable defaults too.
defaultsFor(() => ({ value: 1 }));

{
  const merged: string = directMerge({ 1: 42 }, { '1': 'last' })[1];
  const configured: number = directFactory({ '1': 'first' })({ 1: 42 })['1'];
  const many: number = withDefaults(
    { a: 1 },
    { b: 2 },
    { c: 3 },
    { d: 4 },
    { e: 5 },
    { f: 6 },
    { g: 7 },
    { h: 8 },
    { i: 9 }
  ).i;
  const manyFactory: number = defaultsFor({ a: 1 })(
    { b: 2 },
    { c: 3 },
    { d: 4 },
    { e: 5 },
    { f: 6 },
    { g: 7 },
    { h: 8 },
    { i: 9 }
  ).i;
}
