# Contributor validation

The package is `go-defaults`, with exactly `withDefaults` and `defaultsFor` exported from its root and focused subpaths. Implementations and tests remain JavaScript; TypeScript is limited to declarations and consumer fixtures. Preserve MIT and its copyright notice. Publication requires explicit owner authorisation.

## Commands

Use npm for development and commit `package-lock.json`. Install dependencies with `npm ci` and generate documentation with `npm run docs`. For a complete local check, run `npm run verify:all`.

For a shorter runtime check, run `npm run build` followed by `npm test`. The normal build uses pinned esbuild, validates a complete package in a staging directory, then replaces the old output. Tests use Node's built-in runner.

`npm run verify` runs the build, documentation examples, source coverage, declarations, build recovery, package-content checks, linting, formatting and installed-tarball consumers. `npm run verify:all` adds actual Chromium, Firefox and WebKit checks against the same installed tarball. It exercises both standalone browser bundles and the packaged README script-tag example. Install the matching browsers with `npx playwright install chromium firefox webkit`; on Linux, use `--with-deps` when system libraries are needed. Missing browsers fail this gate.

`npm run coverage` requires 100% line, branch and function coverage for every authored source module. It uses TAP output and checks the coverage inventory, so an unloaded nested module cannot disappear from the result. The shared type runner checks traditional Node resolution, NodeNext, DOM-free, DOM and Bundler modes with exact optional properties both ways, plus ES5/ES2019 ambient libraries. The ES5 fixture uses ES2015 target with ES5 libraries and no emit, avoiding TypeScript 6's deprecated ES5 emission setting; this does not establish ES5 runtime support.

The README and API reference are generated from `scripts/README.template.md` and `scripts/API.template.md`. Update the templates and use `npm run docs`. Runnable JS examples and TS examples are repeated against the installed archive.

Local experiments may live in directories named `temp` or `.tmp` at any depth, including `src/temp/`. These directories are excluded from Git, package builds, linting, formatting, test discovery and source coverage. Keep maintained source and regression fixtures outside them. Build and release cleanup must preserve their local contents.

## Test organization

- `test/runtime/` checks behavior with Node's built-in test runner. The same cases run against source and the built package, and again against the installed archive.
- `test/types/` checks inference and rejected inputs. Detailed cases live in CommonJS fixtures; ESM fixtures enforce matching root, named and subpath signatures and exercise ESM calls. Compiler configurations cover NodeNext, Bundler, DOM/no-DOM, exact optional properties and older ambient libraries.
- `test/consumers/` contains browser contracts and real-browser tests, plus runnable CommonJS/ESM imports and TypeScript consumers that are emitted and executed against the installed archive. The JavaScript consumers also run on the supported older Node versions when their paths are configured.

Name tests for a specific source file after that file, preserving its spelling and casing: for example, `src/withDefaults.cjs` corresponds to `test/runtime/withDefaults.test.cjs`. Use descriptive names for suites covering shared behavior across multiple modules.

Keep each regression with the behavior it protects. Add a separate fixture only for a distinct compiler or consumer boundary; avoid duplicate cases and assertions about internal operation counts or documentation wording.

## Packaging and compatibility

The private source root rejects packing/publication. `npm run build` creates `package/`; `npm run pack:package` builds and creates `artifacts/go-defaults-<version>.tgz` with its digest. The verify gate builds once, packs once and passes that exact archive to `npm run test:package -- --tarball <path>`. A missing archive must fail before packing. No unrelated helper, its declarations or stale distribution files may ship.

CommonJS targets Node 8.0.0 and native ESM wrappers target Node 12.17.0. Set `GO_DEFAULTS_NODE8`, `GO_DEFAULTS_ESM_NODE` and optionally `GO_DEFAULTS_NODE13` to actual runtime paths for installed checks. CI configuration is not evidence that remote jobs ran. For direct script tags, the normal build includes `dist/go-defaults.js` and `dist/go-defaults.min.js`, self-contained UMD bundles exposing `goDefaults`, with source maps and MIT notices. They target ES2017 and require `Reflect.ownKeys`; no polyfills are installed. The regular ESM wrappers still need bundling or CommonJS support in browsers. TypeScript 4.5.2 is the minimum consumer compiler. NodeNext is checked from 4.7.2 and Bundler from 5.0.2. CI checks exact compiler versions against the same verified tarball; a configured job is not evidence of a completed run.

`npm run test:browser` checks the current generated package in all three browser engines. Use `-- --package <installed-package-directory>` to select an installed candidate. `npm run test:package -- --tarball <path> --browser` checks an exact archive, including browsers. The default `verify` gate runs VM checks for global, CommonJS and AMD loading; these do not substitute for the real-browser checks in `verify:all`.

`npm run build:untransformed` omits browser bundles and CDN metadata and is an explicitly requested diagnostic source-copy build; never substitute it for normal esbuild verification. Rebuild normally before release work. Directory replacement tests preserve the previous output on failure. If pruning the old backup fails after replacement, the diagnostic reports `committed: true`, `destination`, `previousBackup` and `cause`; the new destination is already live.

Run `npm run test:types` after building to check an isolated consumer with the pinned compiler. To check another compiler, use `npm run test:types -- --compiler /path/to/typescript/lib/tsc.js`; add `--package /path/to/installed/go-defaults` to check an exact installed candidate. The runner reuses every CommonJS inference and rejection fixture, changing only its temporary file extension for compilers that predate `.cts`. It also checks modern module modes where available and runs emitted CommonJS with `GO_DEFAULTS_NODE8` when supplied.

Legacy resolution checks include default imports from both function subpaths under CommonJS and ES module settings. Named subpath imports use Node16/NodeNext or Bundler resolution; the README documents the interop settings.

CommonJS declarations under `types/` remain the maintained signatures. The build derives legacy `.d.ts` files and adjacent helper declarations from them; edit the maintained files rather than the generated copies. Keep the CommonJS/ESM parity fixture compatible with the oldest NodeNext compiler, without newer import-attribute syntax.

## Regression requirements

- Reject non-nullish primitive and function source layers without coercion or invocation, including every position and callable-proxy cases. Validate in source order and preserve earlier getter-error precedence.
- Reject statically known function/constructor layers, callable unions and optional/spread/union tuples without losing ordinary record inference. Include `any` beside a known function so it cannot hide a different invalid layer. Explicit call/construct signatures remain invalid when `call`, `apply` or `bind` has been overwritten; plain data properties with those names remain valid.
- Keep later defined values winning, skip undefined, and retain null/false/zero/empty strings and function-valued properties.
- Preserve shallow copying, fresh plain objects, own enumerable strings and symbols, a single read per eligible getter, and safe prototype-name properties.
- Preserve captured defaults by reference and rejected-default validation without coercion hooks.
- Keep root/subpath/CommonJS/ESM function identities aligned.
- Preserve declaration checks for optional keys, prototype methods, numeric keys, source unions, native instances, dictionaries and the 64-source precision budget. Arbitrary classes/host objects require conservative widening where ownership/enumerability is unknown.
- Assert the exact two-function public surface and matching root/subpath declarations. Unsupported subpaths must remain unavailable.
- Preserve equivalent defaults behavior in readable and minified browser bundles: undefined-only fallbacks, explicit values (including `document.all`), shallow references, current defaults, symbol keys, getter reads/errors, safe prototype names and invalid-input rejection. Keep loader checks separate from actual browser evidence.
- Keep zero runtime dependencies and verify installed consumers before release work.

## Benchmarking

Build both packages, then run:

```sh
npm run benchmark -- --baseline /path/to/baseline/package --candidate ./package --out /path/to/results.json
```

The benchmark covers configuration layers, repeated and disjoint keys, large records, reusable defaults, symbols, prototype collisions, getters and repeated result reads. Both packages must expose `withDefaults` and `defaultsFor`; the runner does not rebuild or download a baseline. Keep results outside the library.

Microbenchmark results do not establish application or browser performance. Getter/proxy cost and source shapes can dominate. Preserve the single-read and safe-property contracts when optimising.

## Reporting validation

Keep temporary review reports and execution logs outside the library. Record the candidate tested, normal build path, actual runtimes and compilers, remaining dependency advisories and untested environments. A configured CI job does not prove execution or release readiness.
