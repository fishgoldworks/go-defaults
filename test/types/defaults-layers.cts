import { defaultsFor } from 'go-defaults';
const configure = defaultsFor({ retries: 3, enabled: true });
const layered = configure({ retries: 'off' }, null, undefined, { enabled: false }, { retries: undefined });
const retries: string = layered.retries;
const enabled: boolean = layered.enabled;
const symbol = Symbol();
const symbolValue: string = configure({ [symbol]: 1 }, { [symbol]: 'x' })[symbol];
const noValues: number = configure().retries;
const singleExplicit: string = configure<{
  retries: string;
}>({ retries: 'off' }).retries;
// @ts-expect-error An explicit object generic still requires its argument.
configure<{
  retries: string;
}>();
const tuple = [{ extra: 'value' }, { retries: false }] as const;
const tupleResult = configure(...tuple);
const tupleExtra: 'value' = tupleResult.extra;
const tupleRetries: false = tupleResult.retries;
declare const optional: {
  retries?: string;
};
const optionalResult: number | string = configure(optional, { retries: undefined }).retries;
// @ts-expect-error Later shallow replacement removes the earlier nested field.
configure({ nested: { a: 1 } }, { nested: { b: 1 } }).nested.a;
// @ts-expect-error Primitives are outside the typed merge API.
configure({}, 'bad');
// @ts-expect-error An explicit tuple cannot invent absent arguments.
configure<
  [
    {
      retries: string;
    },
    {
      enabled: false;
    }
  ]
>();
declare const dynamic: Array<{
  retries: string;
}>;
// @ts-expect-error Unbounded arrays require a conservative result.
const dynamicValue: number | string = configure(...dynamic).retries;
