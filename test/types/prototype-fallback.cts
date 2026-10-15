import { withDefaults, defaultsFor } from 'go-defaults';
import merge = require('go-defaults/withDefaults');
import defaults = require('go-defaults/defaultsFor');
// Ordinary results inherit Object.prototype when an override is skipped.
declare const maybeString: {
  toString?: string;
};
const toStringRead = withDefaults(maybeString).toString;
// @ts-expect-error A skipped optional key reveals the inherited function.
const unsafeString: string | undefined = toStringRead;
const safeString: string | Object['toString'] = toStringRead;
const factoryRead = defaultsFor(maybeString)().toString;
// @ts-expect-error The factory must not hide the inherited fallback either.
const unsafeFactory: string | undefined = factoryRead;
const safeFactory: string | Object['toString'] = factoryRead;
declare const maybeValue: {
  valueOf: string | undefined;
};
const valueOfRead = merge(maybeValue).valueOf;
const safeValueOf: string | Object['valueOf'] = valueOfRead;
// @ts-expect-error An inherited function is possible, not just a string.
const unsafeValueOf: string | undefined = valueOfRead;
declare const maybeProto: {
  __proto__?: string;
};
const protoRead = defaults(maybeProto)().__proto__;
// Legacy prototype accessors are host-dependent and intentionally conservative.
const safeProto: unknown = protoRead;
// @ts-expect-error An ordinary output may expose its inherited prototype accessor.
const unsafeProto: string | undefined = protoRead;
declare const optionalMethod: {
  hasOwnProperty?: boolean;
};
const method: boolean | Object['hasOwnProperty'] = withDefaults(optionalMethod).hasOwnProperty;
const guaranteed: string = withDefaults({ toString: 'default' }, maybeString).toString;
const replaced: number = withDefaults(maybeString, { toString: 42 }).toString;
const inheritedMethod: Object['toString'] = withDefaults({ toString: undefined }).toString;
const omitted = withDefaults({ ordinary: undefined });
// @ts-expect-error Ordinary undefined-only keys are still omitted.
omitted.ordinary;
// Fresh second pass: dictionary fallbacks cannot accidentally promise callable
// Object.prototype members when arbitrary own values can override those names.
declare const opaque: object;
const opaqueMerged = withDefaults(opaque);
// @ts-expect-error An unknown source may supply a non-callable toString.
opaqueMerged.toString();
declare const dictionary: Record<string, unknown>;
const dictionaryMerged = defaultsFor(dictionary)();
// @ts-expect-error Index signatures must not inherit falsely precise method types.
dictionaryMerged.valueOf();
declare const layers: Array<{
  toString: number;
}>;
// @ts-expect-error Unbounded source fallback must be safe for prototype names too.
withDefaults(...layers).toString();
declare const pattern: {
  [key: `to${string}`]: string;
};
const patternMerged = withDefaults(pattern);
// @ts-expect-error Patterned index signatures are open dictionaries, not finite records.
patternMerged.toString();
// @ts-expect-error Open dictionary reads remain unknown rather than promised strings.
const unsafePattern: string | undefined = patternMerged.totallyMissing;
declare const mixedPattern: {
  fixed: 1;
  [key: `to${string}`]: string;
};
// @ts-expect-error Combining fixed keys with an open pattern is still a dictionary.
withDefaults(mixedPattern).toString();
declare const legacyPattern: {
  [key: `__${string}__`]: string;
};
// @ts-expect-error An absent __proto__ override can expose a non-string prototype.
const unsafePatternProto: string | undefined = withDefaults(legacyPattern).__proto__;
const exactKey: string = withDefaults({ toString: 'own' }).toString;
const absentKey: string = withDefaults({ ordinary: 1 }).toString();
// Finite template expansions still retain their exact keys.
declare const finite: {
  [key in `to${'One' | 'Two'}`]: number;
};
const finiteValues: number = withDefaults(finite).toOne;

// Consumer-added Object members can also be overwritten by unknown own properties.
declare global {
  interface Object {
    goDefaultsCustomMethod(): string;
  }
}
const augmentedDictionary: Record<string, unknown> = { goDefaultsCustomMethod: 42 };
// @ts-expect-error A dictionary may overwrite an augmented method with a number.
withDefaults(augmentedDictionary).goDefaultsCustomMethod();
// @ts-expect-error Reusable defaults must not promise the augmented method either.
defaultsFor(augmentedDictionary)().goDefaultsCustomMethod();
// @ts-expect-error Opaque objects can overwrite the augmented method too.
withDefaults(opaque).goDefaultsCustomMethod();
const knownOwnMethod: string = withDefaults({ goDefaultsCustomMethod: () => 'value' }).goDefaultsCustomMethod();
