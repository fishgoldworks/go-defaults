import Defaults, { createDefaultsMerger, withDefaults, defaultIf } from 'go-defaults';
import * as namespace from 'go-defaults';
import directCreate, { createDefaultsMerger as namedCreate } from 'go-defaults/createDefaultsMerger';
import directMerge from 'go-defaults/withDefaults';
import directValue, { defaultIf as namedValue } from 'go-defaults/defaultIf';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
type Assert<Value extends true> = Value;
type PublicKeys = Assert<Equal<keyof typeof Defaults, 'createDefaultsMerger' | 'defaultIf' | 'withDefaults'>>;
type MergeSignature = Assert<Equal<typeof Defaults.withDefaults, typeof directMerge>>;
type NamespaceKeys = Assert<
  Equal<keyof typeof namespace, 'createDefaultsMerger' | 'default' | 'defaultIf' | 'withDefaults'>
>;
// @ts-expect-error The package does not expose arbitrary helper subpaths.
import unsupported from 'go-defaults/unsupported';
void unsupported;
// @ts-expect-error The old factory subpath was removed in 2.0.0.
import removed from 'go-defaults/defaultsFor';
void removed;

// The full inference/rejection cases live in .cts fixtures. Both resolution branches
// must expose exactly those signatures, including named and focused imports.
import type { CommonJs } from './commonjs-signatures.cjs';
type RootCreateParity = Assert<Equal<typeof createDefaultsMerger, CommonJs['createDefaultsMerger']>>;
type DefaultCreateParity = Assert<Equal<typeof directCreate, CommonJs['createDefaultsMerger']>>;
type NamedCreateParity = Assert<Equal<typeof namedCreate, CommonJs['createDefaultsMerger']>>;
type RootMergeParity = Assert<Equal<typeof withDefaults, CommonJs['withDefaults']>>;
type FocusedMergeParity = Assert<Equal<typeof directMerge, CommonJs['withDefaults']>>;
import { withDefaults as namedMerge } from 'go-defaults/withDefaults';
type NamedMergeParity = Assert<Equal<typeof namedMerge, CommonJs['withDefaults']>>;
type RootValueParity = Assert<Equal<typeof defaultIf, CommonJs['defaultIf']>>;
type FocusedValueParity = Assert<Equal<typeof directValue, CommonJs['defaultIf']>>;
type NamedValueParity = Assert<Equal<typeof namedValue, CommonJs['defaultIf']>>;
type ValueSignature = Assert<Equal<typeof Defaults.defaultIf, typeof directValue>>;

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
const apply = createDefaultsMerger();
const unchanged: number = apply({ value: 1 }).value;
const changed: string = apply({ value: 1 }, { value: 'x' }).value;
const directApplied: null = directCreate()({ value: 1 }, { value: null }).value;
const namedApplied: number = namedCreate()({ value: 1 }, { value: undefined }).value;

// @ts-expect-error An explicitly typed override must actually be supplied.
apply<[{ value: number }, { value: string }]>({ value: 1 });
declare const dictionary: Record<string, number>;
// @ts-expect-error Dictionaries do not guarantee enumerable own keys exist.
const unsafeIndex: number = withDefaults(dictionary).missing;

// @ts-expect-error Focused ESM imports must not retain non-enumerable Symbol methods.
directMerge(Symbol.prototype)[Symbol.toPrimitive]('default');
// @ts-expect-error A wrapper passed to the named ESM factory does not retain BigInt.valueOf.
const unsafeBigInt: bigint = namedCreate()({ option: true }, BigInt.prototype).valueOf();

// @ts-expect-error ESM factory creation must reject callable defaults too.
createDefaultsMerger()(() => ({ value: 1 }));

{
  const merged: string = directMerge({ 1: 42 }, { '1': 'last' })[1];
  const configured: number = directCreate()({ '1': 'first' }, { 1: 42 })['1'];
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
  const manyFactory: number = createDefaultsMerger()(
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
}
