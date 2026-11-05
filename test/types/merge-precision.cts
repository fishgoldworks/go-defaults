import { withDefaults, defaultsFor } from 'go-defaults';
import directMerge = require('go-defaults/withDefaults');
import directDefaults = require('go-defaults/defaultsFor');
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
const layers9 = [
  { key0: 0 },
  { key1: 1 },
  { key2: 2 },
  { key3: 3 },
  { key4: 4 },
  { key5: 5 },
  { key6: 6 },
  { key7: 7 },
  { key8: 8 }
] as const;
const merged9 = withDefaults(...layers9);
const first9: 0 = merged9.key0;
const last9: 8 = merged9.key8;
const configured9 = defaultsFor(layers9[0])(...layers9.slice(1));
// A sliced array is unbounded at the type level and must stay conservative.
// @ts-expect-error An arbitrary array cannot guarantee this key/value.
const unsafeSlice9: number = configured9.key0;
const layers32 = [
  { key0: 0 },
  { key1: 1 },
  { key2: 2 },
  { key3: 3 },
  { key4: 4 },
  { key5: 5 },
  { key6: 6 },
  { key7: 7 },
  { key8: 8 },
  { key9: 9 },
  { key10: 10 },
  { key11: 11 },
  { key12: 12 },
  { key13: 13 },
  { key14: 14 },
  { key15: 15 },
  { key16: 16 },
  { key17: 17 },
  { key18: 18 },
  { key19: 19 },
  { key20: 20 },
  { key21: 21 },
  { key22: 22 },
  { key23: 23 },
  { key24: 24 },
  { key25: 25 },
  { key26: 26 },
  { key27: 27 },
  { key28: 28 },
  { key29: 29 },
  { key30: 30 },
  { key31: 31 }
] as const;
const merged32 = withDefaults(...layers32);
const first32: 0 = merged32.key0;
const last32: 31 = merged32.key31;
const configured32 = defaultsFor(layers32[0])(...layers32.slice(1));
// A sliced array is unbounded at the type level and must stay conservative.
// @ts-expect-error An arbitrary array cannot guarantee this key/value.
const unsafeSlice32: number = configured32.key0;
const layers64 = [
  { key0: 0 },
  { key1: 1 },
  { key2: 2 },
  { key3: 3 },
  { key4: 4 },
  { key5: 5 },
  { key6: 6 },
  { key7: 7 },
  { key8: 8 },
  { key9: 9 },
  { key10: 10 },
  { key11: 11 },
  { key12: 12 },
  { key13: 13 },
  { key14: 14 },
  { key15: 15 },
  { key16: 16 },
  { key17: 17 },
  { key18: 18 },
  { key19: 19 },
  { key20: 20 },
  { key21: 21 },
  { key22: 22 },
  { key23: 23 },
  { key24: 24 },
  { key25: 25 },
  { key26: 26 },
  { key27: 27 },
  { key28: 28 },
  { key29: 29 },
  { key30: 30 },
  { key31: 31 },
  { key32: 32 },
  { key33: 33 },
  { key34: 34 },
  { key35: 35 },
  { key36: 36 },
  { key37: 37 },
  { key38: 38 },
  { key39: 39 },
  { key40: 40 },
  { key41: 41 },
  { key42: 42 },
  { key43: 43 },
  { key44: 44 },
  { key45: 45 },
  { key46: 46 },
  { key47: 47 },
  { key48: 48 },
  { key49: 49 },
  { key50: 50 },
  { key51: 51 },
  { key52: 52 },
  { key53: 53 },
  { key54: 54 },
  { key55: 55 },
  { key56: 56 },
  { key57: 57 },
  { key58: 58 },
  { key59: 59 },
  { key60: 60 },
  { key61: 61 },
  { key62: 62 },
  { key63: 63 }
] as const;
const merged64 = withDefaults(...layers64);
const first64: 0 = merged64.key0;
const last64: 63 = merged64.key63;
const configured64 = defaultsFor(layers64[0])(...layers64.slice(1));
// A sliced array is unbounded at the type level and must stay conservative.
// @ts-expect-error An arbitrary array cannot guarantee this key/value.
const unsafeSlice64: number = configured64.key0;
const configuredNine = defaultsFor(layers9[0])(
  layers9[1],
  layers9[2],
  layers9[3],
  layers9[4],
  layers9[5],
  layers9[6],
  layers9[7],
  layers9[8]
);
const configuredNineLast: 8 = configuredNine.key8;
const configured65 = defaultsFor({ extra: true })(...layers64);
// @ts-expect-error Beyond the documented precision budget, types stay conservative.
const overBudget: number = configured65.key0;
declare const optionalLayer:
  | {
      retries?: string;
    }
  | null
  | undefined;
const optionalMany = withDefaults(
  { retries: 1 },
  optionalLayer,
  optionalLayer,
  optionalLayer,
  optionalLayer,
  optionalLayer,
  optionalLayer,
  optionalLayer,
  optionalLayer,
  optionalLayer,
  optionalLayer,
  optionalLayer,
  optionalLayer,
  optionalLayer,
  optionalLayer,
  optionalLayer,
  optionalLayer
);
const optionalManyValue: number | string = optionalMany.retries;
// @ts-expect-error The default ensures a defined value.
const optionalManyMissing: undefined = optionalMany.retries;
const optionalFactory = defaultsFor({ retries: 1 })(
  optionalLayer,
  optionalLayer,
  optionalLayer,
  optionalLayer,
  optionalLayer,
  optionalLayer,
  optionalLayer,
  optionalLayer
);
const optionalFactoryValue: number | string = optionalFactory.retries;
// Numeric keys and their canonical string spellings are the same runtime key.
const numericThenString = withDefaults({ 1: 42 }, { '1': 'last' });
const numericAccess: string = numericThenString[1];
const stringAccess: string = numericThenString['1'];
const stringThenNumeric = directMerge({ '1': 'first' }, { 1: 42 });
const reversedNumeric: number = stringThenNumeric[1];
const reversedString: number = stringThenNumeric['1'];
const factoryAlias = directDefaults({ 1: 42 })({ '1': 'last' });
const factoryNumeric: string = factoryAlias[1];
const factoryString: string = factoryAlias['1'];
const keyFallback = withDefaults({ 1: 42 }, { '1': undefined });
const fallbackNumeric: number = keyFallback[1];
const fallbackString: number = keyFallback['1'];
declare const maybeNumeric: {
  1?: boolean;
};
const optionalNumeric = withDefaults({ '1': 42 }, maybeNumeric);
const optionalNumericValue: number | boolean = optionalNumeric[1];
declare const maybeString: {
  '1': boolean | undefined;
};
const optionalString = withDefaults({ 1: 42 }, maybeString);
const optionalStringValue: number | boolean = optionalString['1'];
const distinctKeys = withDefaults({ 1: 42 }, { '01': 'different' });
const distinctOne: number = distinctKeys[1];
const distinctZeroOne: string = distinctKeys['01'];
const negativeKey = withDefaults({ [-1]: false }, { '-1': 'final' });
const negativeValue: string = negativeKey[-1];
const decimalKey = withDefaults({ 1.5: false }, { '1.5': 7 });
const decimalValue: number = decimalKey[1.5];
const token = Symbol('token');
const symbols = withDefaults({ [token]: 1, 1: false }, { '1': true });
const retainedSymbol: number = symbols[token];
const omitted = withDefaults({ 1: undefined }, { '1': undefined });
// @ts-expect-error All-undefined keys remain omitted after canonicalization.
omitted[1];
// Optional branches do not erase guaranteed defaults. Union correlations may
// conservatively widen, but no impossible guarantee may be introduced.
declare const branch:
  | {
      a: 1;
      b?: 2;
    }
  | {
      a: 3;
      c: 4;
    };
const unionMerged = withDefaults(branch);
const requiredUnionKey: 1 | 3 = unionMerged.a;
const optionalUnionKey: 2 | undefined = unionMerged.b;
const anotherUnionKey: 4 | undefined = unionMerged.c;
const unionOverride = withDefaults({ a: 0, b: false }, branch);
const guaranteedUnionA: 1 | 3 = unionOverride.a;
const guaranteedUnionB: boolean | 2 = unionOverride.b;
const [firstSource64, ...rest64] = layers64;
const preciseFactory64: 63 = defaultsFor(firstSource64)(...rest64).key63;
const twice64 = [...layers64, ...layers64] as const;
const beyondBudget = withDefaults(...twice64);
// @ts-expect-error A 128-source tuple falls back without breaking compilation.
const notPromisedBeyondBudget: number = beyondBudget.key0;

// Known layers around an unbounded spread must validate without a recursion error.
declare const dynamicLayers: any[];
withDefaults(...dynamicLayers, ...layers64);
withDefaults(...layers64, ...dynamicLayers);
const reusableDefaults = defaultsFor({ enabled: true });
reusableDefaults(...dynamicLayers, ...layers64);
reusableDefaults(...layers64, ...dynamicLayers);
// @ts-expect-error An unknown spread must not hide a known function at the end.
withDefaults(...dynamicLayers, ...layers64, () => {});
// @ts-expect-error Known functions before a long prefix remain invalid too.
withDefaults(() => {}, ...layers64, ...dynamicLayers);
// @ts-expect-error The reusable function applies the same validation.
reusableDefaults(...dynamicLayers, ...layers64, () => {});
// @ts-expect-error The reusable function also rejects a known leading function.
reusableDefaults(() => {}, ...layers64, ...dynamicLayers);
