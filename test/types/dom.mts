import { withDefaults, createDefaultsMerger } from 'go-defaults';
declare const options: { element?: HTMLElement };
const merged = withDefaults({ enabled: true }, options);
const element: HTMLElement | undefined = merged.element;
const configured: boolean = createDefaultsMerger()({ enabled: true }, options).enabled;

void element;
void configured;
