import { withDefaults, createDefaultsMerger } from 'go-defaults';
const result: number = withDefaults({ retries: 2 }).retries;
const other: string = createDefaultsMerger()({ mode: 'fast' }).mode;
