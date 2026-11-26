# Contributing

The package is `go-defaults`. It exports [`withDefaults`](docs/API.md#withdefaultsdefaults-overrides), [`createDefaultsMerger`](docs/API.md#createdefaultsmergeroptions) and [`defaultIf`](docs/API.md#defaultifvalue-fallback-predicate) from its root and focused subpaths. Implementations and tests remain JavaScript; TypeScript is limited to declarations and consumer fixtures. Preserve MIT and its copyright notice. Publication requires explicit owner authorisation.

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

Edit `scripts/README.template.md` and `scripts/API.template.md`. Both `build` and `build:untransformed` regenerate the README and API reference before staging their output. If documentation generation fails, the previous package remains intact. Use `npm run docs` to regenerate documentation independently of a build.

`test:docs` checks freshness without rewriting generated files, then checks local links, the shared README structure and runnable JS and TS examples. The installed-package gate repeats the example and README checks against the archive. The checked-in README checker at `scripts/lib/check-library-readme.cjs` mirrors the shared checker in `Instructions/` for standalone CI.

Runnable examples must finish and confirm that every displayed-result assertion executed; a zero exit alone is insufficient. Result annotations are actual `// => ...` comments, so matching text in string data is ignored. Instrumentation preserves annotated return values and control flow. Checker regressions live in `test/docs/test-examples.test.js`.

Local experiments may live in directories named `temp` or `.tmp` at any depth, including `src/temp/`. These directories are excluded from Git, package builds, linting, formatting, test discovery and source coverage. Keep maintained source and regression fixtures outside them. Build and release cleanup must preserve their local contents.

## Verification and release candidates

`npm run verify` runs lint, formatting, the normal build, documentation examples, source coverage, declarations, build recovery, tooling and release regressions, artifact checks and installed consumers. `npm run verify:all` adds Chromium, Firefox and WebKit execution of both standalone bundles and the packaged README script-tag example. Install the matching browsers with `npx --no-install playwright install chromium firefox webkit`. On Linux, add `--with-deps` when system libraries are needed. Missing browsers fail the full gate.

Browser verification starts an independent Node runner and requires completion of all three engines and their four cases, including resource cleanup. Its whole-worker deadline is 180000 milliseconds, including startup; use `npm run test:browser -- --timeout-ms 240000` to select another positive deadline. Partial output is retained on failure. Nonzero exits, incomplete/zero-test runs and missing completion records fail the gate. Primary browser errors and concurrent cleanup errors are reported together.

The supervisor owns Windows descendants through a kill-on-close native job using the built-in Windows PowerShell/.NET adapter. Unix uses an isolated process group, a preload registry with process-birth identities, and an inherited ownership marker to find native children even after they detach and their parent exits. On Linux, the supervisor reads `/proc` environments only for same-user processes that could have inherited its marker. Unix cleanup requires `ps` and readable environments for possible descendants; it cannot identify a native daemon that both leaves its process group and removes the marker before its parent exits. Missing or denied platform support fails the run. Process inspection shares a two-second budget, followed by at most three seconds for termination and pipe cleanup. Cleanup failures remain visible alongside the original failure. No new runtime dependency is published. Infrastructure regressions live in `test/tooling/test-browser.test.mjs` and `browser-worker.test.mjs`; actual browser assertions remain in `test/browser/browser.test.cjs`.

CI runs `verify:all` on the contributor pin from `.nvmrc`. The candidate job uploads the verified archive and its SHA-256 sidecar and passes the verified digest as a job output. Each downstream job checks the downloaded archive against both the sidecar and the producer digest before using it. The contributor floor job runs `npm ci` and `verify` on Node.js 22.16.0 against that same archive. The consumer runtime and compiler matrices check it separately.

```sh
npm run pack:package
npm run test:package -- --tarball artifacts/go-defaults-2.0.0.tgz
npm run verify:all -- --tarball artifacts/go-defaults-2.0.0.tgz
npm run test:runtime -- --tarball artifacts/go-defaults-2.0.0.tgz --node /absolute/path/to/node
```

`pack:package` builds and writes an archive and SHA-256 sidecar to the ignored `artifacts/` directory. With no archive argument, each verification gate builds and packs once. Both gates accept `--tarball` to reuse a retained candidate. Keep retained archives in `artifacts/` or another folder outside `package/`. Verification rejects paths inside the generated output, including aliases, before running checks. The gates build the current checkout for comparison, install the supplied archive offline, and compare its file inventory and bytes with that build. Invalid candidates and mismatches fail the gate. Record the checkout revision and relevant working-tree changes separately from the archive digest. The verifier checks the digest before and after using the candidate and validates its sidecar when present.

Packing always creates a new archive, even when npm dry-run is inherited. The archive and checksum are prepared in a temporary staging directory before replacing the previous pair. Ordinary write or replacement failures preserve or restore the previous files. If rollback fails, the error reports the retained recovery directory and preserves the packing and recovery errors. Once the new pair is installed, a staging-cleanup failure reports `committed: true` and the active tarball path; it does not try to restore backups that cleanup may already have removed.

Before preparing the checksum or moving previous files, packing decompresses the fresh archive and checks its tar structure, package identity, npm-reported inventory and exact file contents against the generated package. Invalid or incomplete output is rejected while the previous candidate remains intact.

`test:package` and `test:runtime` use the specified archive directly. The package gate checks installed documentation, import identities, runtime behaviour, declarations and VM loaders. `test:runtime` uses the selected Node executable for CommonJS and adds native ESM on Node 12.17.0+ within 12.x and Node 14 or later. CI checks Node 8.0.0, 12.17.0, 13.0.0 and 24.20.0 against the same verified archive and runs the compiler matrix separately.

Installed Node tests run independently of inherited worker state and must finish their tests and cleanup before exiting. Plain CommonJS/ESM consumers and the artifact CLI must also produce a fresh completion record for their check and runtime; a zero exit alone is insufficient. Artifact checks execute candidate code in a child process, leaving archive identity checks and installed-directory cleanup under the parent verifier's control. Original child failures and concurrent completion-record cleanup failures remain visible together.

### Windows editor locks

Windows can reject the staged `package/` directory rename with `EPERM` while an editor, language service or terminal holds a handle inside the generated output. The build preserves the previous complete package and removes its unused staging directory; release the handle and rerun the normal build. Keep terminals outside `package/` and configure watchers around authored source.

VS Code's nonrecursive language-service watchers can bypass `files.watcherExclude`. If its file-watcher process pins `package/dist`, set `js/ts.tsserver.watchOptions` at **workspace level**, using the generated package's absolute path in `excludeDirectories` (the directory and its descendants) and `excludeFiles` (its descendants). For a multi-root workspace this belongs in the `.code-workspace` settings, not one folder's `.vscode/settings.json`; the setting has window scope. Selecting an options object switches JS/TS watching for the workspace from VS Code's delegated watcher to TypeScript's native watcher backend. The active workspace used for this review excludes only go-defaults' generated paths; its other files, folders and editor contents are retained. After rebuilding an API change, refresh the language service if the editor still shows an older generated declaration. Compiler and release checks continue to validate the rebuilt declarations. See the [VS Code watcher reference](https://github.com/microsoft/vscode/wiki/File-Watcher-Internals) and [TypeScript watch options](https://www.typescriptlang.org/docs/handbook/configuring-watch.html).

The Windows build regression holds a real watcher on generated output, verifies that a failed replacement preserves every previous file, releases the watcher and verifies successful normal rebuild and stale-file removal. It is skipped on other operating systems because this lock behaviour is Windows-specific. Normal staged replacement and rollback remain the build path.

## Test organisation

- Root `test/*.test.cjs` files check runtime behaviour and entry identities. `scripts/test.js` shares their discovery with coverage and installed-package checks. These cases run against source and the built package, then against the installed archive.
- `test/types/` owns compiler configurations, inference and rejection cases, and emitted CommonJS and ESM consumers. It covers traditional Node resolution, Node16/NodeNext, Bundler, DOM/no-DOM, exact optional properties and older ambient libraries.
- `test/browser/` owns the shared defaults contract, VM bundle loader cases and Playwright tests. `test:artifacts` runs the VM cases with distribution inventory, metadata, source-map and entry-point checks. `test:browser` runs the real-browser cases.
- `test/package/` owns exact-archive consumer fixtures and `test:release` regressions for candidate validation and private-root packing guards. `test:build` checks assembly, failure and rollback under `test/build.test.mjs` and `test/build/`. `test/tooling/` and `test/docs/` own contributor-tool regressions and documentation generation tests.

The runtime and coverage commands require each Node test worker to finish its tests and cleanup and exit naturally. A premature `process.exit(0)` fails the run, including when another file passes. Explicit skips and todos retain Node's reporting. These commands accept only the documented `--coverage` option; forwarded Node flags remain unsupported.

The Node-test portions of `test:docs`, `test:build`, `test:tooling`, `test:artifacts` and `test:release` use the same completion guard through `scripts/run-node-tests.mjs`. They start independently of inherited worker state, require natural completion of tests and cleanup, and preserve normal child forks, skips and todos. The shared runner accepts explicit test files or globs; Node flags are not forwarded.

Both verification modes check that all required scripts, including `test:package`, are present and non-empty before running a phase. Required npm invocations disable `if-present`, so inherited optional-script configuration cannot hide a missing command, even if it disappears after that initial check.

Name a dedicated test after its source owner, preserving spelling and casing. For example, `src/withDefaults.cjs` corresponds to `test/withDefaults.test.cjs`. Use descriptive names for suites spanning multiple modules. Separate adjacent cases with a blank line and keep specialised fixtures with their owning suite.

Keep each regression with the behaviour it protects. Add a separate fixture only for a distinct compiler or consumer boundary; avoid duplicate cases and assertions about internal operation counts or documentation wording.

## Packaging and compatibility

The private source root rejects packing and publication. `npm run build` creates the complete consumer distribution under `package/` and validates staged output before replacement. To use a directory dependency or link, build first and target `package/`. The package allowlist excludes contributor docs, tests and tooling.

Run `npm run build -- --check` to confirm that the README and API reference are current and that `package/` matches a fresh build. The check stages its build outside the checkout and leaves the existing documents and package untouched. `npm run test:artifacts` runs this check before inspecting the package and running the VM bundle tests. Run `npm run build` to refresh stale output.

The published `dist/` paths and explicit `.cjs` and `.mjs` entries preserve the existing Node and bundler contracts. CommonJS targets Node 8.0.0. Native ESM starts at Node 12.17.0 on the supported release lines, and Node 13.0.0 uses the CommonJS export-map fallback. Physical subpath wrappers and legacy `.d.ts` files cover consumers without modern export-map resolution. Installed runtime and emitted compiler checks protect these paths, including default/named export and function identity. To repeat the historical runtime checks during package verification, set `GO_DEFAULTS_NODE8`, `GO_DEFAULTS_ESM_NODE` and optionally `GO_DEFAULTS_NODE13` to the selected executables.

`npm run test:browser` checks the current generated package in all three browser engines. Use `-- --package <installed-package-directory>` to select an installed candidate. `npm run test:package -- --tarball <path> --browser` checks an exact archive, including browsers. The default `verify` gate runs VM checks for global, CommonJS and AMD loading; these do not substitute for the real-browser checks in `verify:all`.

`npm run build:untransformed` omits browser bundles and CDN metadata and is an explicitly requested diagnostic source-copy build; never substitute it for normal esbuild verification. Rebuild normally before release work. Directory replacement tests preserve the previous output on failure. If pruning the old backup fails after replacement, the diagnostic reports `committed: true`, `destination`, `previousBackup` and `cause`; the new destination is already live.

## Tooling and compatibility choices

- **Build.** The pinned esbuild targets preserve the published `dist/` module files and produce the readable ES2017 UMD bundle. Terser minifies that bundle. Artifact checks validate encoded source-map segments and representative source locations in Node entries and both bundles, including the diagnostic build's line-level maps. Staging and recovery tests protect the complete package, and a two-build byte comparison protects retained-candidate verification. The opt-in source-copy build remains available for diagnosing transform issues and has its own recovery and inventory checks.
- **Browser.** The pinned npm Playwright runner exercises Chromium, Firefox and WebKit against the exact installed candidate. It also bundles that package's root and focused imports with the pinned esbuild and default minification, checking input rejection, getter order and explicit `document.all` values. Separate VM checks cover global, CommonJS and AMD loaders and the two bundles' API contract. The UMD bundles expose `goDefaults` and include source maps and MIT notices. They require `Reflect.ownKeys`. Browser ES module wrappers require bundling or CommonJS support.
- **Coverage.** Node's test runner measures source lines, branches and functions at 100%. The TAP inventory check accounts for each authored module, including nested modules, and its tooling regression rejects unloaded files even when aggregate coverage is green. Distribution loader checks have their own command and are exercised again after installation.
- **Compilers.** The pinned contributor compiler and exact compatibility matrix protect different environments. CI checks TypeScript 4.5.2, 4.7.2, 5.0.2, 5.4.5 and 6.0.3 against the same archive. The oldest compiler checks traditional resolution and emitted CommonJS. NodeNext checks start at 4.7.2, and Bundler at 5.0.2. The ES5 fixture checks ES5 ambient declarations with an ES2015 target and no emit.

Revisit the bundler, browser harness, coverage engine and tool pins in separate changes with equivalent compatibility evidence.

Run `npm run test:types` after building to check an isolated consumer with the pinned compiler. To check another compiler, use `npm run test:types -- --compiler /path/to/typescript/lib/tsc.js`; add `--package /path/to/installed/go-defaults` to check an exact installed candidate. The runner reuses every CommonJS inference and rejection fixture, changing only its temporary file extension for compilers that predate `.cts`. It also checks modern module modes where available and runs emitted CommonJS with `GO_DEFAULTS_NODE8` when supplied.

Each emitted consumer must finish its runtime checks and produce fresh completion evidence for that invocation, module mode and runtime. Temporary launchers keep compiler output intact, including when the same legacy consumer runs on a selected older Node version. Keep runtime assertions at module scope so loading the emitted file executes them. If verification and project cleanup both fail, both errors are retained with the temporary project path; a zero exit alone is insufficient evidence of consumer completion.

Separate consumers under `test/types/strict/` check unchecked indices and isolated module compilation without changing the normal configurations. They use `noUncheckedIndexedAccess` with `isolatedModules` on older compilers and with `verbatimModuleSyntax` from TypeScript 5.0. Verbatim mode includes isolated module checks; TypeScript 5.0 rejects combining both isolation flags. CommonJS import-equals and native ES module syntax stay in their respective fixtures. These checks cover legacy resolution, NodeNext from 4.7.2 and ESM Bundler resolution from 5.0.2. Keep the version-aware invocation and compiler-failure regressions in `test/tooling/test-types.test.mjs`.

Legacy resolution checks include default imports from function subpaths under CommonJS and ES module settings. Named subpath imports use Node16/NodeNext or Bundler resolution; the README documents the interop settings.

CommonJS declarations under `types/` remain the maintained signatures. The build derives legacy `.d.ts` files and adjacent helper declarations from them; edit the maintained files rather than the generated copies. Keep the CommonJS/ESM parity fixture compatible with the oldest NodeNext compiler, without newer import-attribute syntax.

## Regression requirements

- For [`defaultIf`](docs/API.md#defaultifvalue-fallback-predicate), require both value arguments and distinguish omission from explicit `undefined`. Preserve every defined value, including `null`, falsy values, `NaN` and `document.all`, with the built-in predicate. A custom predicate decides whether to select the fallback and must return a primitive boolean. Preserve reference identity and verify inference with and without a custom predicate.
- Reject non-nullish primitive and function source layers without coercion or invocation, including every position and callable-proxy cases. Validate in source order and preserve earlier getter-error precedence.
- Reject statically known primitive layers, including branded scalars, and function/constructor layers, callable unions and optional/spread/union tuples without losing ordinary record inference. Include `any` beside a known invalid layer so it cannot hide that layer. Explicit call/construct signatures remain invalid when `call`, `apply` or `bind` has been overwritten; plain data properties with those names remain valid. Keep branded property values, whole-value defaults and boxed primitive objects valid.
- For the built-in rule, let later defined values win, skip `undefined`, and retain explicit values such as `null`, `false`, `0`, empty strings and functions.
- For [`createDefaultsMerger`](docs/API.md#createdefaultsmergeroptions), capture the options and accept defaults on each call. Let `shouldFallback` decide for each visited override value, including explicit `undefined`. Preserve shallow inference at depth zero and retain known root keys and scalar types at greater depths.
- At positive depths, merge only colliding plain records and use safe own-property writes at each merged level. Preserve accepted `undefined`, traversal order, and the references of branches assigned as whole values. Finite depth bounds traversal through cycles.
- Preserve shallow copying, fresh plain objects, own enumerable strings and symbols, a single read per eligible getter, and safe prototype-name properties.
- Preserve captured defaults by reference and rejected-default validation without coercion hooks.
- Keep root/subpath/CommonJS/ESM function identities aligned.
- Preserve declaration checks for optional keys, prototype methods, numeric keys, source unions, native instances, dictionaries and the 64-source precision budget. Arbitrary classes/host objects require conservative widening where ownership/enumerability is unknown.
- Assert the three public exports and matching root/subpath declarations. Include the removed factory among unsupported subpaths.
- Preserve equivalent defaults behaviour in readable and minified browser bundles: undefined-only fallbacks, explicit values (including `document.all`), shallow references, current defaults, symbol keys, getter reads/errors, safe prototype names and invalid-input rejection. Keep loader checks separate from actual browser evidence.
- Keep zero runtime dependencies and verify installed consumers before release work.

## Benchmarking

Build both packages, then run:

```sh
npm run benchmark -- --baseline /path/to/baseline/package --candidate ./package --out /path/to/results.json
```

Maintain workload inputs and cases in `benchmarks/cases.mjs`. The CLI, paired timing loop and report generation live in `scripts/benchmark.mjs`.

The benchmark covers configuration layers, repeated and disjoint keys, large records, reusable defaults, symbols, prototype collisions, getters and repeated result reads. Both packages must expose [`withDefaults`](docs/API.md#withdefaultsdefaults-overrides) and a defaults factory. The benchmark accepts [`createDefaultsMerger`](docs/API.md#createdefaultsmergeroptions) in current packages and `defaultsFor` in older ones. Supply an already built local baseline. Keep results outside the library.

The command rejects report paths that would overwrite its driver, workload, loaded modules or package metadata, including filesystem aliases. It checks before timing and again before writing to cover dependencies loaded during a run. Non-finite batch checksums fail outside the timed loop during calibration, warmup or sampling; failed checks leave prior reports untouched. Path checks protect accidental collisions, not hostile concurrent filesystem changes. They do not fingerprint measured input bytes.

Microbenchmark results do not establish application or browser performance. Getter/proxy cost and source shapes can dominate. Preserve the single-read and safe-property contracts when optimising.

## Reporting validation

Keep temporary review reports and execution logs outside the library. Record the candidate tested, normal build path, actual runtimes and compilers, remaining dependency advisories and untested environments. A configured CI job does not prove execution or release readiness.

## Readability formatting

`npm run format` runs local Prettier, then the complete ESLint configuration with automatic fixes limited to JSDoc separators and statement padding, and finishes with a read-only Prettier check. Remaining lint errors or warnings fail the command. Use `npm run lint:fix` for broader fixes and review their changes separately.

The exact development pins `eslint-plugin-jsdoc` and `@stylistic/eslint-plugin` enforce a blank line before documented units, including single-line and multiline JSDoc after a trailing comment, and separate declaration groups, completed blocks and final returns. Related declarations and assertions can remain compact. These mechanical rules do not decide every logical grouping or remove every existing gap after documentation. Preserve compiler, lint, coverage and preprocessor directives beside their targets.

The physical fixture projects in `test/tooling/readability.test.mjs` exercise the real language configuration, formatting CLI, exclusions and two-cycle stability through the normal tooling and verification gates. The externally owned canonical README checker remains byte-identical: only its two spacing rules and Prettier formatting are excluded; its correctness checks remain active. Generated output and local experiments retain their existing exclusions. Revisit this narrow exception when updating the shared checker.

The guard protects selected ESLint fixes on Prettier-normalised input. A fix that would change a `node:coverage`, `c8` or `v8` ignore-next span's physical lines remains an error for manual reconciliation. Prettier's existing reflow can itself change counted spans; reconcile the counts and layout, or use an appropriate formatter-ignore arrangement, then rerun actual coverage. This guard does not establish preservation across every whole-format input.
