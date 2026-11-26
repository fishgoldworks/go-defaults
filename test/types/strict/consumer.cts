import Defaults = require('go-defaults');
import defaultIf = require('go-defaults/defaultIf');
import withDefaults = require('go-defaults/withDefaults');
import createDefaultsMerger = require('go-defaults/createDefaultsMerger');

declare const supplied: number[];
const selected = defaultIf(supplied, []);
// @ts-expect-error Unchecked array indices remain possibly undefined.
const unsafeItem: number = selected[0];
const item: number | undefined = selected[0];
const tuple = defaultIf([7, 'ready'] as const, null);
const first: 7 = tuple[0];
const merged: number = withDefaults({ count: 7 }, { count: undefined }).count;
const configured: number = createDefaultsMerger()({ count: 7 }, { count: undefined }).count;
const rootValue: typeof defaultIf = Defaults.defaultIf;

declare const dictionary: Record<string, number>;
const dynamic = withDefaults(dictionary);
// @ts-expect-error Unknown dictionary results cannot promise a number.
const unsafeDictionary: number = dynamic.count;

declare const brand: unique symbol;
declare const id: string & { readonly [brand]: 'id' };
// @ts-expect-error Branded primitives remain invalid source layers.
withDefaults(id);
const retainedId: typeof id = withDefaults({ id }).id;
