# Changelog

## 2.0.0

### Breaking changes

- Removed `defaultsFor` from the package root, its function subpath and the browser global. To reuse fixed defaults with the same fallback rule, import [`withDefaults`](docs/API.md#withdefaultsdefaults-overrides) and replace `defaultsFor(defaults)` with `(...overrides) => withDefaults(defaults, ...overrides)`.

### Added

- Added [`defaultIf(value, fallback, predicate?)`](docs/API.md#defaultifvalue-fallback-predicate) to select a fallback when a value is `undefined` or meets a custom condition.
- Added [`createDefaultsMerger`](docs/API.md#createdefaultsmergeroptions) to reuse a fallback rule and merge a chosen number of nested record levels. Pass defaults and overrides each time you call the returned function.

### Changed

- Clarified root and function-subpath imports and aligned usage examples across module formats and browsers.
- Standardised API wording, code formatting and browser guidance.

### Fixed

- TypeScript now rejects branded primitives passed as source objects, matching runtime validation. Pass branded values as property values. See the [input typing guidance](docs/API.md#inputs-and-generic-wrappers).
- Consumer-minified browser builds now reject `document.all` as a source object before reading properties from later sources. To copy `document.all` into the result, pass it as a property value.

### Performance

- Repeated nested overrides reuse branches created by the same merge, reducing copying while preserving input objects.

## 1.0.1 — 2026-10-23

### Fixed

- Corrected result types for `Symbol` and `BigInt` wrapper inputs so native methods are not inferred as copied properties.

### Changed

- Clarified usage, typing limits and contributor requirements, including TypeScript import forms for function subpaths.

## 1.0.0

Initial release.

- Apply default values with [`withDefaults`](docs/API.md#withdefaultsdefaults-overrides), or create a reusable function with `defaultsFor` to apply the same defaults to multiple objects.
- Use CommonJS or ES module entry points, individual helper imports and TypeScript declarations.
- Load readable or minified standalone browser bundles through the `goDefaults` global, with source maps for debugging.
