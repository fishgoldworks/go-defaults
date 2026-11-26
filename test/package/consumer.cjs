'use strict';

var assert = require('assert');
var Defaults = require('go-defaults');
var names = ['createDefaultsMerger', 'defaultIf', 'withDefaults'];

assert.deepStrictEqual(Object.keys(Defaults).sort(), names);
names.forEach(function (name) {
  assert.strictEqual(require('go-defaults/' + name), Defaults[name]);
});
['unsupported', 'mergeDefaults', 'defaultsFor', 'createWithDefaults', 'withDefault'].forEach(function (name) {
  assert.throws(
    function () {
      require('go-defaults/' + name);
    },
    function (error) {
      return error.code === 'MODULE_NOT_FOUND' || error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED';
    }
  );
});
var symbol = Symbol('option');
var layer = { retries: undefined, enabled: false, extra: null };

layer[symbol] = 3;
var merged = Defaults.withDefaults({ retries: 3 }, layer, JSON.parse('{"__proto__":5}'));

assert.strictEqual(merged.retries, 3);
assert.strictEqual(merged.enabled, false);
assert.strictEqual(merged.extra, null);
assert.strictEqual(merged[symbol], 3);
assert.strictEqual(merged.__proto__, 5);
assert.strictEqual(Object.getPrototypeOf(merged), Object.prototype);
var defaults = { retries: 1 };
var configure = Defaults.createDefaultsMerger();

defaults.retries = 2;
assert.deepStrictEqual(configure(defaults, { retries: undefined }), { retries: 2 });
assert.notStrictEqual(configure(defaults), configure(defaults));
[false, 123, 'text', Symbol('layer'), function () {}].forEach(function (invalid) {
  assert.throws(function () {
    Defaults.withDefaults({}, invalid);
  }, TypeError);
  assert.throws(function () {
    configure(defaults, invalid);
  }, TypeError);
});
assert.deepStrictEqual(Defaults.withDefaults(null, undefined), {});
var mergeIgnoringNull = Defaults.createDefaultsMerger({
  shouldFallback: function (value) {
    return value === null;
  }
});

assert.deepStrictEqual(mergeIgnoringNull({ retries: 1 }, { retries: 2 }, { retries: null }), { retries: 2 });
assert.deepStrictEqual(Defaults.createDefaultsMerger({ mergeDepth: 1 })({ params: { a: 1 } }, { params: { b: 2 } }), {
  params: { a: 1, b: 2 }
});
assert.strictEqual(
  Defaults.defaultIf(null, 10, function (value) {
    return value === null;
  }),
  10
);
assert.strictEqual(Defaults.defaultIf(undefined, undefined), undefined);
assert.strictEqual(Defaults.defaultIf(undefined, 10), 10);
[null, false, 0, -0, '', NaN, Symbol('value')].forEach(function (value) {
  assert.ok(Object.is(Defaults.defaultIf(value, 10), value));
});
if (typeof BigInt === 'function') assert.strictEqual(Defaults.defaultIf(BigInt(5), 10), BigInt(5));
var selected = {};

assert.strictEqual(Defaults.defaultIf(selected, null), selected);
var factoryValue = function () {
  throw new Error('Function values must not be called');
};

assert.strictEqual(Defaults.defaultIf(undefined, factoryValue), factoryValue);
assert.throws(function () {
  Defaults.defaultIf();
}, TypeError);
console.log('CommonJS defaults imports, unsupported subpaths and behaviour passed on ' + process.version);
if (process.env.GO_DEFAULTS_CONSUMER_COMPLETION_FILE)
  require('fs').writeFileSync(
    process.env.GO_DEFAULTS_CONSUMER_COMPLETION_FILE,
    JSON.stringify({
      token: process.env.GO_DEFAULTS_CONSUMER_COMPLETION_TOKEN,
      kind: 'cjs',
      node: process.version
    }),
    { flag: 'wx' }
  );
