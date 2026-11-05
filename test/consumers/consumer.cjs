'use strict';
var assert = require('assert');
var Defaults = require('go-defaults');
var names = ['defaultsFor', 'withDefaults'];
assert.deepStrictEqual(Object.keys(Defaults).sort(), names);
names.forEach(function (name) {
  assert.strictEqual(require('go-defaults/' + name), Defaults[name]);
});
['unsupported'].forEach(function (name) {
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
var configure = Defaults.defaultsFor(defaults);
defaults.retries = 2;
assert.deepStrictEqual(configure({ retries: undefined }), { retries: 2 });
assert.notStrictEqual(configure(), configure());
[false, 123, 'text', Symbol('layer'), function () {}].forEach(function (invalid) {
  assert.throws(function () {
    Defaults.withDefaults({}, invalid);
  }, TypeError);
  assert.throws(function () {
    configure(invalid);
  }, TypeError);
});
assert.deepStrictEqual(Defaults.withDefaults(null, undefined), {});
console.log('CommonJS defaults imports, unsupported subpaths and behaviour passed on ' + process.version);
