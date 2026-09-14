# Repository guidance

- Keep authored runtime and tests in JavaScript. TypeScript is limited to declarations and consumer type fixtures.
- Preserve the canonical helper behavior, including `undefined` handling in `withDefaults` and `null` as an explicit value.
- Keep CommonJS, ESM, root, and helper subpath exports on the same runtime function identities.
- This source is unlicensed; do not publish or change its licensing without the owner's explicit decision.
- Keep the runtime dependency-free and run `yarn test` plus a packed consumer smoke check before release work.
