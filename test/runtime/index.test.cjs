const assert = require('node:assert/strict');
const { test } = require('node:test');
const packageOnly = process.env.GO_DEFAULTS_TEST_PACKAGE_ONLY === '1';
const sourceOnly = !packageOnly && Boolean(process.env.GO_DEFAULTS_TEST_SOURCE_ONLY);
const packageName = 'go-defaults';
const packageRequire = packageOnly
  ? require
  : require('node:module').createRequire(__dirname + '/../../package/package.json');
// Local checks load the build; installed checks exercise the public ESM export map.
const importPackage = (specifier) =>
  import(
    packageOnly
      ? specifier
      : '../../package/dist/' + (specifier === packageName ? 'index' : specifier.slice(packageName.length + 1)) + '.mjs'
  );
const targets = require('./targets.cjs');
const names = ['defaultsFor', 'withDefaults'];
for (const [label, api] of targets) {
  test(`${label}: exposes only the two defaults utilities`, () => {
    assert.deepEqual(Object.keys(api).sort(), names);
  });
}
test('CommonJS and ESM retain root and focused import identities', async () => {
  if (sourceOnly) {
    const api = require('../../src/index.cjs');
    const esm = await import('../../src/index.mjs');
    assert.equal(esm.default, api);
    for (const name of names) {
      const direct = await import('../../src/' + name + '.mjs');
      assert.equal(direct.default, api[name]);
      assert.equal(direct[name], api[name]);
      assert.equal(esm[name], api[name]);
    }
    return;
  }
  const api = packageRequire(packageName);
  const esm = await importPackage(packageName);
  assert.deepEqual(Object.keys(esm).sort(), ['default', ...names]);
  assert.equal(esm.default, api);
  for (const name of names) {
    assert.equal(packageRequire(packageName + '/' + name), api[name]);
    const direct = await importPackage(packageName + '/' + name);
    assert.equal(direct.default, api[name]);
    assert.equal(direct[name], api[name]);
    if (!packageOnly) {
      const source = await import('../../src/' + name + '.mjs');
      assert.equal(source.default, require('../../src/index.cjs')[name]);
      assert.equal(source[name], source.default);
    }
  }
  if (!packageOnly) assert.equal((await import('../../src/index.mjs')).default, require('../../src/index.cjs'));
});
test('unsupported names cannot be imported as package subpaths', { skip: sourceOnly }, async () => {
  for (const name of ['unsupported']) {
    assert.throws(() => packageRequire(packageName + '/' + name), {
      code: /^(ERR_PACKAGE_PATH_NOT_EXPORTED|MODULE_NOT_FOUND)$/
    });
    await assert.rejects(importPackage(packageName + '/' + name), {
      code: /^(ERR_PACKAGE_PATH_NOT_EXPORTED|ERR_MODULE_NOT_FOUND)$/
    });
  }
});

test('merging existing keys works without Object.hasOwn', () => {
  const withDefaults = require(
    process.env.GO_DEFAULTS_TEST_PACKAGE_ONLY ? 'go-defaults/withDefaults' : '../../src/withDefaults.cjs'
  );
  const hasOwn = Object.hasOwn;
  try {
    Object.hasOwn = undefined;
    assert.deepEqual(withDefaults({ a: 1 }, { a: 2 }), { a: 2 });
  } finally {
    Object.hasOwn = hasOwn;
  }
});

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
for (const [label, directory] of targets.map(([label]) => [
  label,
  label === 'source' ? path.resolve(__dirname, '../../src') : path.dirname(packageRequire.resolve(packageName))
])) {
  test(`${label}: defaults work without JSON, timers, promises or browser globals`, () => {
    const context = vm.createContext({});
    vm.runInContext(
      'JSON = undefined; Promise = undefined; setTimeout = undefined; clearTimeout = undefined; AbortController = undefined; Symbol = undefined;',
      context
    );
    const cache = new Map();
    function load(name) {
      const file = path.resolve(directory, name);
      assert.equal(path.dirname(file), directory);
      if (cache.has(file)) return cache.get(file).exports;
      const module = { exports: {} };
      cache.set(file, module);
      const factory = vm.runInContext(
        '(function(require, module, exports) {' + fs.readFileSync(file, 'utf8') + '\n})',
        context
      );
      factory(load, module, module.exports);
      return module.exports;
    }
    const api = load('index.cjs');
    assert.deepEqual(Object.keys(api).sort(), ['defaultsFor', 'withDefaults']);
    const token = Symbol('option');
    const merged = api.withDefaults({ value: 1, [token]: 2 }, { value: undefined, explicit: null });
    assert.equal(merged.value, 1);
    assert.equal(merged[token], 2);
    assert.equal(merged.explicit, null);
    const defaults = { value: 1 };
    const configure = api.defaultsFor(defaults);
    defaults.value = 3;
    assert.equal(configure().value, 3);
  });
}
