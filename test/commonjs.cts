import { defaultsFor, isJson, parseBool, result, wait, withDefaults } from '@fishgold/go-js';
import directWait = require('@fishgold/go-js/wait');

const delayed: Promise<void> = wait(0);
const sameWait: typeof wait = directWait;
const numberResult: number = result((a: number, b: number) => a + b, 2, 3);
const valid: boolean = isJson('{}');
const parsed: boolean | undefined = parseBool('true');
const mergeDefaults = defaultsFor({ active: true });
const merged: Record<PropertyKey, unknown> = withDefaults({ active: true }, { active: undefined });

void delayed;
void sameWait;
void numberResult;
void valid;
void parsed;
void mergeDefaults;
void merged;
