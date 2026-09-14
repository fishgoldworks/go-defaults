# @fishgold/go-js

Dependency-free JavaScript helpers with named root exports:

```js
import { defaultsFor, isJson, parseBool, result, wait, withDefaults } from '@fishgold/go-js';

withDefaults({ theme: 'light' }, { theme: undefined }); // { theme: 'light' }
parseBool(' TRUE '); // true
```

Each helper also has an explicit subpath, such as `@fishgold/go-js/withDefaults`. CommonJS subpaths return the helper directly; ESM subpaths provide default and named exports. All entry points share runtime function identities.

Build and validate independently with `yarn test`. Create a package archive with `yarn pack --out ./artifacts/fishgold-go-js-0.1.0.tgz`.

This source is currently unlicensed. See `LICENSE` and `PROVENANCE.md` before any distribution or publication.
