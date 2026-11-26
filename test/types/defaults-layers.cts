import { createDefaultsMerger } from 'go-defaults';
const configure = createDefaultsMerger();
const layered = configure(
  { retries: 3, enabled: true },
  { retries: 'off' },
  null,
  undefined,
  { enabled: false },
  { retries: undefined }
);
const retries: string = layered.retries;
const enabled: boolean = layered.enabled;
const symbol = Symbol();
const symbolValue: string = configure({ retries: 3, enabled: true }, { [symbol]: 1 }, { [symbol]: 'x' })[symbol];
const noValues: number = configure({ retries: 3, enabled: true }).retries;
const singleExplicit: string = configure<[{ retries: number; enabled: boolean }, { retries: string }]>(
  { retries: 3, enabled: true },
  { retries: 'off' }
).retries;

// @ts-expect-error An explicit override in a tuple requires its value.
configure<[{ retries: number; enabled: boolean }, { retries: string }]>({ retries: 3, enabled: true });
const tuple = [{ extra: 'value' }, { retries: false }] as const;
const tupleResult = configure({ retries: 3, enabled: true }, ...tuple);
const tupleExtra: 'value' = tupleResult.extra;
const tupleRetries: false = tupleResult.retries;

declare const optional: {
  retries?: string;
};
const optionalResult: number | string = configure({ retries: 3, enabled: true }, optional, {
  retries: undefined
}).retries;

// @ts-expect-error Later shallow replacement removes the earlier nested field.
configure({ retries: 3, enabled: true }, { nested: { a: 1 } }, { nested: { b: 1 } }).nested.a;
// @ts-expect-error Primitives are outside the typed merge API.
configure({ retries: 3, enabled: true }, {}, 'bad');
// @ts-expect-error An explicit tuple cannot invent absent arguments.
configure<
  [
    { retries: number; enabled: boolean },
    {
      retries: string;
    },
    {
      enabled: false;
    }
  ]
>({ retries: 3, enabled: true });
declare const dynamic: Array<{
  retries: string;
}>;
// @ts-expect-error Unbounded arrays require a conservative result.
const dynamicValue: number | string = configure({ retries: 3, enabled: true }, ...dynamic).retries;
