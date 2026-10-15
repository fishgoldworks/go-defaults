import { withDefaults, defaultsFor } from 'go-defaults';
const result: number = withDefaults({ retries: 2 }).retries;
const other: string = defaultsFor({ mode: 'fast' })().mode;
