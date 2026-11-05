# Repository instructions

## Read first

- Read [contributor validation](CONTRIBUTING.md), including its regression requirements.
- Read the [full API reference](docs/API.md) when changing public contracts.

## Shared workflow

In the shared Projects workspace, use `Instructions/library-review.md` for library reviews and `Instructions/library-release.md` for release preparation. Follow the applicable engineering and agent task execution standards in `Libs/engineering-playbook`.

Start each commit subject with a capitalised imperative verb, such as `Update API examples`.

## Local constraints

- Preserve the MIT licence and copyright notice. Publication requires explicit owner authorisation.
- Keep authored runtime and tests in JavaScript; TypeScript is limited to declarations and consumer fixtures. Keep the runtime dependency-free.
- Keep the public API focused on default values: `withDefaults` and `defaultsFor`. Preserve their runtime identities, merge semantics and regression requirements.
- The untransformed diagnostic build is explicitly opt-in; never silently replace the normal esbuild build.

## Validation

- Follow the [contributor workflow](CONTRIBUTING.md). Run `npm test` plus a packed-consumer check before release work.
- Report the checks actually executed, remaining environment limitations and the build path used.
- Keep temporary review reports and logs outside the library.
