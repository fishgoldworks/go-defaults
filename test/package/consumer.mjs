import assert from 'assert';
import { createRequire } from 'module';
import Defaults, * as namespace from 'go-defaults';
const require = createRequire(import.meta.url);
assert.strictEqual(Defaults, require('go-defaults'));
assert.deepStrictEqual(Object.keys(namespace).sort(), ['default', 'defaultsFor', 'withDefaults']);
Promise.all(
  ['defaultsFor', 'withDefaults'].map(async (name) => {
    const direct = await import('go-defaults/' + name);
    assert.strictEqual(direct.default, Defaults[name]);
    assert.strictEqual(direct[name], Defaults[name]);
    assert.strictEqual(namespace[name], Defaults[name]);
  })
)
  .then(async () => {
    for (const name of ['unsupported']) {
      await assert.rejects(
        import('go-defaults/' + name),
        (error) => error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED' || error.code === 'ERR_MODULE_NOT_FOUND'
      );
    }
    assert.deepStrictEqual(Defaults.withDefaults({ a: 1 }, { a: undefined, b: null }), { a: 1, b: null });
    for (const invalid of [false, 123, 'text', Symbol('layer'), () => {}]) {
      assert.throws(() => Defaults.withDefaults({}, invalid), TypeError);
      assert.throws(() => Defaults.defaultsFor({})(invalid), TypeError);
    }
    console.log('Native ESM defaults imports and unsupported subpaths passed on ' + process.version);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
