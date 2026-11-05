import { withDefaults, defaultsFor } from 'go-defaults';
declare const options: { element?: HTMLElement };
const merged = withDefaults({ enabled: true }, options);
const element: HTMLElement | undefined = merged.element;
const configured: boolean = defaultsFor({ enabled: true })(options).enabled;
void element;
void configured;
