import { defaultIf } from 'go-defaults';
import direct from 'go-defaults/defaultIf';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

declare let fallbackText: string;
declare let fallbackNumber: number;
declare let definedNumber: number;
declare let optionalNumber: number | undefined;
declare let nullableNumber: number | null | undefined;
declare let optionalText: string | undefined;
declare let optionalFallback: number | undefined;
declare let broadUnknown: unknown;
declare let broadAny: any;
declare let broadVoid: void;

const defined = defaultIf(definedNumber, fallbackText);
const optional = defaultIf(optionalNumber, fallbackText);
const nullable = defaultIf(nullableNumber, fallbackText);
const nullValue = defaultIf(null, 10);
const undefinedValue = defaultIf(undefined, fallbackNumber);
const optionalDefault = defaultIf(optionalText, optionalFallback);
const unknownValue = defaultIf(broadUnknown, 10);
const anyValue = defaultIf(broadAny, 10);
const unknownDefault = defaultIf(definedNumber, broadUnknown);
const anyDefault = defaultIf(definedNumber, broadAny);
const voidValue = defaultIf(broadVoid, fallbackNumber);
const undefinedDefault = defaultIf(undefined, undefined);
const directValue = direct(optionalNumber, fallbackText);

declare const optionalProperty: { count?: number };
const propertyValue = defaultIf(optionalProperty.count, 10);

declare const tuple: [number | undefined, string];
const tupleValue = defaultIf(...tuple);

const explicitBuiltIn = defaultIf(definedNumber, broadUnknown, undefined);
const custom = defaultIf(optionalNumber, fallbackText, (value) => {
  const received: number | undefined = value;

  return received === 0;
});

declare const maybeRule: ((value: number) => boolean) | undefined;
const variableRule = defaultIf(definedNumber, fallbackText, maybeRule);

type Selection = [
  Assert<Equal<typeof defined, number>>,
  Assert<Equal<typeof optional, number | string>>,
  Assert<Equal<typeof nullable, number | null | string>>,
  Assert<Equal<typeof nullValue, null>>,
  Assert<Equal<typeof undefinedValue, number>>,
  Assert<Equal<typeof optionalDefault, number | string | undefined>>,
  Assert<Equal<typeof unknownValue, unknown>>,
  Assert<Equal<typeof anyValue, any>>,
  Assert<Equal<typeof unknownDefault, number>>,
  Assert<Equal<typeof anyDefault, number>>,
  Assert<Equal<typeof voidValue, void | number>>,
  Assert<Equal<typeof undefinedDefault, undefined>>,
  Assert<Equal<typeof directValue, number | string>>,
  Assert<Equal<typeof propertyValue, number>>,
  Assert<Equal<typeof tupleValue, number | string>>,
  Assert<Equal<typeof explicitBuiltIn, number>>,
  Assert<Equal<typeof custom, number | string | undefined>>,
  Assert<Equal<typeof variableRule, number | string>>
];

const record = { title: 'Home' };
const readonlyTuple = [1, 'Home'] as const;
const callback = (value: number) => String(value);

declare const promise: Promise<number>;
const returnedRecord = defaultIf(record, null);
const returnedTuple = defaultIf(readonlyTuple, null);
const returnedCallback = defaultIf(callback, null);
const returnedPromise = defaultIf(promise, null);

type References = [
  Assert<Equal<typeof returnedRecord, typeof record>>,
  Assert<Equal<typeof returnedTuple, typeof readonlyTuple>>,
  Assert<Equal<typeof returnedCallback, typeof callback>>,
  Assert<Equal<typeof returnedPromise, typeof promise>>
];

function applyFallback<T>(value: T | undefined, fallback: T): T {
  return defaultIf(value, fallback);
}

function keepDefined<T extends object>(value: T, fallback: unknown): T {
  return defaultIf(value, fallback);
}

function keepDefinedScalar<T extends string | null>(value: T, fallback: any): T {
  return defaultIf(value, fallback);
}

// @ts-expect-error Both value arguments are required.
defaultIf();
// @ts-expect-error Passing undefined differs from omitting the fallback.
defaultIf(undefined);
// @ts-expect-error The supplied value must match its explicit type argument.
defaultIf<string, number>(20, 10);
// @ts-expect-error A possibly defined string cannot be narrowed to the numeric fallback.
const invalidNarrowing: number = defaultIf(optionalText, 10);

// @ts-expect-error The callback must return a primitive boolean synchronously.
defaultIf(0, 10, async () => true);
// @ts-expect-error The callback must handle undefined when the value may be undefined.
defaultIf(optionalNumber, fallbackText, (value: number) => value === 0);

void [applyFallback, keepDefined, keepDefinedScalar, invalidNarrowing];
