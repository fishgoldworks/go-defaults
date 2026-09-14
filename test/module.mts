import { defaultsFor, isJson, parseBool, result, wait, withDefaults } from '@fishgold/go-js';
import directWait, { wait as namedWait } from '@fishgold/go-js/wait';
import directWithDefaults from '@fishgold/go-js/withDefaults';

const delayed: Promise<void> = wait(0);
const sameWait: typeof wait = directWait;
const sameNamedWait: typeof wait = namedWait;
const sameWithDefaults: typeof withDefaults = directWithDefaults;
const numberResult: number = result((a: number, b: number) => a + b, 2, 3);
const valid: boolean = isJson('{}');
const parsed: boolean | undefined = parseBool('true');
const mergeDefaults = defaultsFor({ active: true });

void delayed;
void sameWait;
void sameNamedWait;
void sameWithDefaults;
void numberResult;
void valid;
void parsed;
void mergeDefaults;
