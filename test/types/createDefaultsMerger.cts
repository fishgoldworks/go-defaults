import { createDefaultsMerger } from 'go-defaults';

const merge = createDefaultsMerger({
  shouldFallback(value, key) {
    const property: string | symbol = key;

    return typeof property === 'string' && value === null;
  }
});
const defaults = { count: 0, flag: false, params: { limit: 10 } };
const resolved = merge(defaults, { count: 'auto', label: 'Page' }, { count: null, presentUndefined: undefined });
const count: number | string | null = resolved.count;
const flag: boolean = resolved.flag;
const label: string | undefined = resolved.label;
const presentUndefined: undefined = resolved.presentUndefined;

// @ts-expect-error If the override is rejected, an earlier property can survive.
const lastOnly: null = resolved.count;
// @ts-expect-error A key supplied only by overrides may be absent.
const requiredLabel: string = resolved.label;

const explicitUndefined = merge(defaults, { count: undefined }).count;
const maybeCount: number | undefined = explicitUndefined;

// @ts-expect-error A custom rule can accept explicitly present undefined.
const guaranteedCount: number = explicitUndefined;

const applyDefaults = createDefaultsMerger();
const defaultCount: number = applyDefaults(defaults, { count: undefined }).count;
const latestCount: string = applyDefaults(defaults, { count: 'auto' }).count;
const undefinedOptionsCount: string = createDefaultsMerger(undefined)(defaults, { count: 'auto' }).count;
const explicitDefaultRule = createDefaultsMerger({ mergeDepth: 0, shouldFallback: undefined });
const explicitDefaultCount: number = explicitDefaultRule(defaults, { count: undefined }).count;
const replaced = explicitDefaultRule(defaults, { params: { label: 'Home' } }).params;
const replacementLabel: string = replaced.label;

// @ts-expect-error A depth-zero branch is replaced.
replaced.limit;

const widenedOptions: {} = { shouldFallback: () => true };
const widenedCount = createDefaultsMerger(widenedOptions)({ count: 'earlier' }, { count: 5 }).count;
const possibleCount: number | string = widenedCount;

// @ts-expect-error A widened options type can hide a rule that keeps the earlier value.
const onlyLatestCount: number = widenedCount;

const customShallowOptions = { mergeDepth: 0, shouldFallback: () => true } as const;
const shallowOptions: { mergeDepth: 0 } = customShallowOptions;
const shallowCount = createDefaultsMerger(shallowOptions)({ count: 'earlier' }, { count: 5 }).count;
const possibleShallowCount: number | string = shallowCount;

// @ts-expect-error A known depth can still hide a custom rule.
const onlyShallowLatestCount: number = shallowCount;

const nestedOptions = { mergeDepth: 1, shouldFallback: undefined };
const ruleOptions: { shouldFallback: undefined } = nestedOptions;
const widenedDepth = createDefaultsMerger(ruleOptions)(defaults, { count: 'auto', params: { label: 'Home' } });
const knownLatestCount: string = widenedDepth.count;

// @ts-expect-error A known rule can still hide a positive depth.
const replacedParams: { label: string } = widenedDepth.params;

const nested = createDefaultsMerger(nestedOptions)(defaults, { count: 'auto', params: { label: 'Home' } });
const countAfterMerge: string = nested.count;
const paramsAfterMerge: unknown = nested.params;

// @ts-expect-error A positive depth cannot promise a particular nested object shape.
const guaranteedParams: { label: string } = nested.params;

// @ts-expect-error Expanding the depth does not introduce unknown top-level keys.
nested.absent;

declare const depth: number;
const variableDepth = createDefaultsMerger({ mergeDepth: depth, shouldFallback: () => false });
const mightBeUndefined: number | undefined = variableDepth(defaults, { count: undefined }).count;

// @ts-expect-error A variable depth may merge records.
const variableParams: { limit: number } = variableDepth(defaults).params;

declare const id: string & { readonly customerId: unique symbol };
declare const amount: (number & { readonly cents: unique symbol }) | undefined;
const branded = createDefaultsMerger({ mergeDepth: 1 })({ id, amount });
const retainedId: typeof id = branded.id;
const retainedAmount: typeof amount = branded.amount;
const retainedAtVariableDepth: typeof id = variableDepth({ id }).id;

declare const idOrRecord: typeof id | { name: string };
const mixed = createDefaultsMerger({ mergeDepth: 1 })({ id: idOrRecord });

// @ts-expect-error A union that can contain a record still has an unknown result shape.
const knownMixedId: typeof idOrRecord = mixed.id;

const token = Symbol('option');
const keyed = merge(undefined, { [token]: 1, 0: 'first' });
const tokenValue: number | undefined = keyed[token];
const first: string | undefined = keyed[0];

// @ts-expect-error The factory captures configuration. Supply defaults to the returned function.
createDefaultsMerger({ defaults: {} });
// @ts-expect-error Depth must be a number.
createDefaultsMerger({ mergeDepth: '1' });
// @ts-expect-error An asynchronous decision is unsupported.
createDefaultsMerger({ shouldFallback: async () => false });
// @ts-expect-error The predicate must return a boolean.
createDefaultsMerger({ shouldFallback: () => 'skip' });
// @ts-expect-error A predicate must be able to receive any override value.
createDefaultsMerger({ shouldFallback: (value: string) => value === '' });
// @ts-expect-error A configurable merge still requires object or nullish layers.
variableDepth({}, 0);
// @ts-expect-error Callable layers are rejected.
merge(() => ({}));
