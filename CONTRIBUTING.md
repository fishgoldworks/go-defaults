# Contributing

The package is `go-defaults`, with exactly [`withDefaults`](docs/API.md#withdefaultsdefaults-overrides) and [`defaultsFor`](docs/API.md#defaultsfordefaultvalues) exported from its root and focused subpaths. Implementations and tests remain JavaScript; TypeScript is limited to declarations and consumer fixtures. Preserve MIT and its copyright notice. Publication requires explicit owner authorisation.

## Getting started

Use npm with Node.js 22.16.0 or later, excluding Node.js 23. The [CI contributor pin](.nvmrc) is suitable for local development. See [Runtime support](README.md#runtime-support) for consumer requirements.

```sh
npm ci
npm run build
npm test
npm run test:types
npm run test:docs
```

The development manifest pins `minimatch` 11.0.4 through an override because upstream linting dependencies still specify affected 10.x versions ([advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249)). Recheck the override when updating those tools.

Edit `scripts/README.template.md` and `scripts/API.template.md`, then run `npm run docs` before building. `test:docs` checks freshness, local links, the shared README structure and runnable JS and TS examples. The installed-package gate repeats the example and README checks against the archive. The checked-in README checker at `scripts/lib/check-library-readme.cjs` mirrors the shared checker in `Instructions/` for standalone CI.

Local experiments may live in directories named `temp` or `.tmp` at any depth, including `src/temp/`. These directories are excluded from Git, package builds, linting, formatting, test discovery and source coverage. Keep maintained source and regression fixtures outside them. Build and release cleanup must preserve their local contents.

## Verification and release candidates

`npm run verify` runs lint, formatting, the normal build, documentation examples, source coverage, declarations, build recovery, tooling and release regressions, artifact checks and installed consumers. `npm run verify:all` adds Chromium, Firefox and WebKit execution of both standalone bundles and the packaged README script-tag example. Install the matching browsers with `npx --no-install playwright install chromium firefox webkit`. On Linux, add `--with-deps` when system libraries are needed. Missing browsers fail the full gate.

```sh
npm run pack:package
npm run test:package -- --tarball artifacts/go-defaults-1.0.1.tgz
npm run verify:all -- --tarball artifacts/go-defaults-1.0.1.tgz
npm run test:runtime -- --tarball artifacts/go-defaults-1.0.1.tgz --node /absolute/path/to/node
```

`pack:package` builds and writes an archive and SHA-256 sidecar to the ignored `artifacts/` directory. With no archive argument, each verification gate builds and packs once. Both gates accept `--tarball` to reuse a retained candidate. They build the current checkout for comparison, install the supplied archive offline, and compare its file inventory and bytes with that build. Invalid candidates and mismatches fail the gate. Record the checkout revision and relevant working-tree changes separately from the archive digest. The verifier checks the digest before and after using the candidate and validates its sidecar when present.

`test:package` and `test:runtime` use the specified archive directly. The package gate checks installed documentation, import identities, runtime behavior, declarations and VM loaders. `test:runtime` uses the selected Node executable for CommonJS and adds native ESM on Node 12.17.0+ within 12.x and Node 14 or later. CI checks Node 8.0.0, 12.17.0, 13.0.0 and 24.20.0 against the same verified archive and runs the compiler matrix separately.

## Test organisation

- Root `test/*.test.cjs` files check runtime behavior and entry identities. `scripts/test.js` shares their discovery with coverage and installed-package checks. These cases run against source and the built package, then against the installed archive.
- `test/types/` owns compiler configurations, inference and rejection cases, and emitted CommonJS and ESM consumers. It covers traditional Node resolution, Node16/NodeNext, Bundler, DOM/no-DOM, exact optional properties and older ambient libraries.
- `test/browser/` owns the shared defaults contract, VM bundle loader cases and Playwright tests. `test:artifacts` runs the VM cases with distribution inventory, metadata, source-map and entry-point checks. `test:browser` runs the real-browser cases.
- `test/package/` owns exact-archive consumer fixtures and `test:release` regressions for candidate validation and private-root packing guards. `test:build` checks assembly, failure and rollback under `test/build.test.mjs` and `test/build/`. `test/tooling/` and `test/docs/` own contributor-tool regressions and documentation generation tests.

Name a dedicated test after its source owner, preserving spelling and casing. For example, `src/withDefaults.cjs` corresponds to `test/withDefaults.test.cjs`. Use descriptive names for suites spanning multiple modules. Separate adjacent cases with a blank line and keep specialised fixtures with their owning suite.

Keep each regression with the behavior it protects. Add a separate fixture only for a distinct compiler or consumer boundary; avoid duplicate cases and assertions about internal operation counts or documentation wording.

## Packaging and compatibility

The private source root rejects packing and publication. `npm run build` creates the complete consumer distribution under `package/` and validates staged output before replacement. To use a directory dependency or link, build first and target `package/`. The package allowlist excludes contributor docs, tests and tooling.

The published `dist/` paths and explicit `.cjs` and `.mjs` entries preserve the existing Node and bundler contracts. CommonJS targets Node 8.0.0. Native ESM starts at Node 12.17.0 on the supported release lines, and Node 13.0.0 uses the CommonJS export-map fallback. Physical subpath wrappers and legacy `.d.ts` files cover consumers without modern export-map resolution. Installed runtime and emitted compiler checks protect these paths, including default/named export and function identity. To repeat the historical runtime checks during package verification, set `GO_DEFAULTS_NODE8`, `GO_DEFAULTS_ESM_NODE` and optionally `GO_DEFAULTS_NODE13` to the selected executables.

`npm run test:browser` checks the current generated package in all three browser engines. Use `-- --package <installed-package-directory>` to select an installed candidate. `npm run test:package -- --tarball <path> --browser` checks an exact archive, including browsers. The default `verify` gate runs VM checks for global, CommonJS and AMD loading; these do not substitute for the real-browser checks in `verify:all`.

`npm run build:untransformed` omits browser bundles and CDN metadata and is an explicitly requested diagnostic source-copy build; never substitute it for normal esbuild verification. Rebuild normally before release work. Directory replacement tests preserve the previous output on failure. If pruning the old backup fails after replacement, the diagnostic reports `committed: true`, `destination`, `previousBackup` and `cause`; the new destination is already live.

## Tooling and compatibility choices

- **Build.** The pinned esbuild targets preserve the published `dist/` module files and produce the readable ES2017 UMD bundle. Terser minifies that bundle. Staging and recovery tests protect the complete package, and a two-build byte comparison protects retained-candidate verification. The opt-in source-copy build remains available for diagnosing transform issues and has its own recovery and inventory checks.
- **Browser.** The pinned npm Playwright runner exercises Chromium, Firefox and WebKit against the exact installed candidate. Separate VM checks cover global, CommonJS and AMD loaders and the two bundles' API contract. The UMD bundles expose `goDefaults` and include source maps and MIT notices. They require `Reflect.ownKeys`. Browser ES module wrappers require bundling or CommonJS support.
- **Coverage.** Node's test runner measures source lines, branches and functions at 100%. The TAP inventory check accounts for each authored module, including nested modules, and its tooling regression rejects unloaded files even when aggregate coverage is green. Distribution loader checks have their own command and are exercised again after installation.
- **Compilers.** The pinned contributor compiler and exact compatibility matrix protect different environments. CI checks TypeScript 4.5.2, 4.7.2, 5.0.2, 5.4.5 and 6.0.3 against the same archive. The oldest compiler checks traditional resolution and emitted CommonJS. NodeNext checks start at 4.7.2, and Bundler at 5.0.2. The ES5 fixture checks ES5 ambient declarations with an ES2015 target and no emit.

Revisit the bundler, browser harness, coverage engine and tool pins in separate changes with equivalent compatibility evidence.

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

The benchmark covers configuration layers, repeated and disjoint keys, large records, reusable defaults, symbols, prototype collisions, getters and repeated result reads. Both packages must expose [`withDefaults`](docs/API.md#withdefaultsdefaults-overrides) and [`defaultsFor`](docs/API.md#defaultsfordefaultvalues). Supply an already built local baseline. Keep results outside the library.

Microbenchmark results do not establish application or browser performance. Getter/proxy cost and source shapes can dominate. Preserve the single-read and safe-property contracts when optimising.

## Reporting validation

Keep temporary review reports and execution logs outside the library. Record the candidate tested, normal build path, actual runtimes and compilers, remaining dependency advisories and untested environments. A configured CI job does not prove execution or release readiness.
