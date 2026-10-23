# Changelog

## Unreleased

### Fixed

- Corrected result types for `Symbol` and `BigInt` wrapper inputs so native methods are not inferred as copied properties.

## 1.0.0

Initial release.

- Apply default values with `withDefaults`, or create a reusable function with `defaultsFor` to apply the same defaults to multiple objects.
- Use CommonJS or ES module entry points, individual helper imports and TypeScript declarations.
- Load readable or minified standalone browser bundles through the `goDefaults` global, with source maps for debugging.
