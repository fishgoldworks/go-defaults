'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const targets = require('./targets.cjs');

for (const [label, { withDefaults, defaultsFor }] of targets) {
  const check = (name, body) => test(label + ': ' + name, body);
  check('applies defaults to independent objects without carrying overrides into later calls', () => {
    const defaults = Object.freeze({ title: 'Untitled', visible: true });
    const applyDefaults = defaultsFor(defaults);
    const overrides = Object.freeze({ title: 'First' });
    const first = applyDefaults(overrides);
    assert.deepEqual(first, { title: 'First', visible: true });
    assert.notEqual(first, overrides);
    for (const values of [[], [{}], [undefined], [null]]) {
      const next = applyDefaults(...values);
      assert.deepEqual(next, defaults);
      assert.notEqual(next, defaults);
      assert.notEqual(next, first);
    }
    assert.deepEqual(defaultsFor({})({ title: 'Supplied' }), { title: 'Supplied' });
  });

  check('defaultsFor layers retain null, falsy values, shallow replacement, and undefined fallback', () => {
    const defaults = Object.freeze({ a: 1, b: 2, c: 3, d: 4, nested: { old: true } });
    const first = Object.freeze({ a: null, b: false, c: 0, d: '', nested: { next: true } });
    const last = Object.freeze({ a: undefined, extra: 'x' });
    const configure = defaultsFor(defaults);
    const actual = configure(first, last);
    assert.deepEqual(actual, { a: null, b: false, c: 0, d: '', nested: first.nested, extra: 'x' });
    assert.equal(actual.nested, first.nested);
    assert.deepEqual(actual, withDefaults(defaults, first, last));
    assert.notEqual(actual, configure(first, last));
    assert.equal(defaults.a, 1);
  });

  check('defaultsFor copies symbols and special keys safely in every layer', () => {
    const key = Symbol('key');
    const configure = defaultsFor({ [key]: 'default' });
    const actual = configure({ [key]: 1 }, JSON.parse('{"__proto__":{"admin":true}}'), { [key]: 2 });
    assert.equal(actual[key], 2);
    assert.equal(Object.hasOwn(actual, '__proto__'), true);
    assert.equal(Object.getPrototypeOf(actual), Object.prototype);
    assert.equal(actual.admin, undefined);
  });

  check('defaultsFor reads each getter once per source occurrence and uses live defaults', () => {
    let calls = 0;
    const defaults = { value: 1 };
    const configure = defaultsFor(defaults);
    const source = {
      get value() {
        return ++calls;
      }
    };
    assert.deepEqual(configure(source, source, { value: undefined }), { value: 2 });
    assert.equal(calls, 2);
    defaults.value = 5;
    assert.deepEqual(configure(null, undefined, {}), { value: 5 });
  });

  check('defaultsFor stops at an accessor failure without mutating prior inputs', () => {
    const original = Object.freeze({ value: 1 });
    const sentinel = new Error('get failed');
    assert.throws(
      () =>
        defaultsFor(original)(
          { value: 2 },
          {
            get value() {
              throw sentinel;
            }
          },
          {
            get other() {
              return assert.fail('later sources must not be read');
            }
          }
        ),
      (error) => error === sentinel
    );
    assert.equal(original.value, 1);
  });

  test(`${label}: defaultsFor accepts all ordered override sources`, () => {
    const configure = defaultsFor({ attempts: 3, enabled: true });
    assert.deepEqual(configure({ attempts: 4 }, null, undefined, { enabled: false }, { attempts: undefined }), {
      attempts: 4,
      enabled: false
    });
  });

  check('defaults creation does not read valid object fields or snapshot values', () => {
    let reads = 0;
    const source = {
      get value() {
        return ++reads;
      }
    };
    const configure = defaultsFor(source);
    assert.equal(reads, 0);
    assert.deepEqual(configure(), { value: 1 });
    assert.deepEqual(configure(), { value: 2 });
  });

  test(`${label}: defaults factory captures its object, not its values, and processes overrides once in order`, () => {
    const calls = [];
    const nested = { reference: true };
    const defaults = {
      get first() {
        calls.push('defaults:first');
        defaults.second = 'new';
        return nested;
      },
      second: 'old'
    };
    const configure = defaultsFor(defaults);
    assert.deepEqual(calls, []);
    function invoke() {
      const override = {
        get first() {
          calls.push('override:first');
          return undefined;
        }
      };
      const result = configure(override, { second: undefined }, { third: false });
      assert.equal(Object.hasOwn(override, 'first'), true);
      return result;
    }
    const first = invoke();
    const second = invoke();
    assert.notEqual(first, second);
    assert.equal(first.first, nested);
    assert.equal(second.first, nested);
    assert.deepEqual(first, { first: nested, second: 'new', third: false });
    assert.deepEqual(second, first);
    assert.deepEqual(calls, ['defaults:first', 'override:first', 'defaults:first', 'override:first']);
    assert.equal(defaults.second, 'new'); // an intentional effect of the defaults getter
  });
}
