import assert from 'assert';
import fs from 'fs';
import { createRequire } from 'module';
import Defaults, * as namespace from 'go-defaults';
const require = createRequire(import.meta.url);

assert.strictEqual(Defaults, require('go-defaults'));
const names = ['createDefaultsMerger', 'defaultIf', 'withDefaults'];

assert.deepStrictEqual(Object.keys(namespace).sort(), ['default', ...names].sort());
Promise.all(
  names.map(async (name) => {
    const direct = await import('go-defaults/' + name);

    assert.strictEqual(direct.default, Defaults[name]);
    assert.strictEqual(direct[name], Defaults[name]);
    assert.strictEqual(namespace[name], Defaults[name]);
  })
)
  .then(async () => {
    for (const name of ['unsupported', 'mergeDefaults', 'defaultsFor', 'createWithDefaults', 'withDefault']) {
      await assert.rejects(
        import('go-defaults/' + name),
        (error) => error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED' || error.code === 'ERR_MODULE_NOT_FOUND'
      );
    }

    assert.deepStrictEqual(Defaults.withDefaults({ a: 1 }, { a: undefined, b: null }), { a: 1, b: null });
    const mergeIgnoringNull = namespace.createDefaultsMerger({ shouldFallback: (value) => value === null });

    assert.deepStrictEqual(mergeIgnoringNull({ title: 'Guide' }, { title: null }), { title: 'Guide' });
    assert.strictEqual(Defaults.defaultIf(undefined, 10), 10);
    assert.strictEqual(Defaults.defaultIf(null, 10), null);
    assert.strictEqual(Defaults.defaultIf(undefined, undefined), undefined);
    assert.throws(() => Defaults.defaultIf(), TypeError);
    for (const invalid of [false, 123, 'text', Symbol('layer'), () => {}]) {
      assert.throws(() => Defaults.withDefaults({}, invalid), TypeError);
      assert.throws(() => Defaults.createDefaultsMerger()({}, invalid), TypeError);
    }

    console.log('Native ESM defaults imports and unsupported subpaths passed on ' + process.version);
    if (process.env.GO_DEFAULTS_CONSUMER_COMPLETION_FILE)
      fs.writeFileSync(
        process.env.GO_DEFAULTS_CONSUMER_COMPLETION_FILE,
        JSON.stringify({
          token: process.env.GO_DEFAULTS_CONSUMER_COMPLETION_TOKEN,
          kind: 'mjs',
          node: process.version
        }),
        { flag: 'wx' }
      );
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
