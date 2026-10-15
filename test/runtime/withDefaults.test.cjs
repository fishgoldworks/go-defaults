'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const targets = require('./targets.cjs');

for (const [label, { withDefaults, defaultsFor }] of targets) {
  const check = (name, body) => test(label + ': ' + name, body);
  check('combines defaults and ordered overrides, replacing nested values shallowly', () => {
    const defaults = Object.freeze({ title: 'Untitled', visible: true, count: 10, nested: { original: true } });
    const overrides = Object.freeze({ title: undefined, visible: false, count: 0, nested: { replacement: true } });
    const result = withDefaults(defaults, { title: 'Earlier', count: 5 }, overrides);
    assert.deepEqual(result, { title: 'Earlier', visible: false, count: 0, nested: { replacement: true } });
    assert.equal(result.nested, overrides.nested);
    assert.notEqual(result, defaults);
    assert.notEqual(result, overrides);
    const copy = withDefaults(defaults);
    assert.deepEqual(copy, defaults);
    assert.notEqual(copy, defaults);
    assert.equal(copy.nested, defaults.nested);
    assert.deepEqual(withDefaults({ value: null }, { value: 3 }), { value: 3 });
  });

  check('creates a new shallow object without cloning or mutating nested values', () => {
    const nested = Object.freeze({ value: 1 });
    const defaults = Object.freeze({ nested, active: true });
    const override = Object.freeze({ active: false });
    const merged = withDefaults(defaults, override);
    assert.notEqual(merged, defaults);
    assert.notEqual(merged, override);
    assert.equal(merged.nested, nested);
    assert.equal(merged.active, false);
    assert.equal(defaults.active, true);
  });

  check('skips nullish layers while preserving explicit property values', () => {
    const callback = () => 1;
    const defaults = { nil: 1, flag: true, count: 3, text: 'default', callback: null };
    const overrides = { nil: null, flag: false, count: 0, text: '', callback, missing: undefined };
    for (const merge of [withDefaults, defaultsFor({})]) {
      assert.deepEqual(merge(null, defaults, undefined, overrides, { count: undefined }), {
        nil: null,
        flag: false,
        count: 0,
        text: '',
        callback
      });
      assert.deepEqual(merge(), {});
      assert.notEqual(merge(), merge());
    }
    assert.throws(() => defaultsFor(), TypeError);
    assert.throws(() => defaultsFor(null), TypeError);
  });

  for (const size of [9, 64, 65, 128, 1024]) {
    check(`merges ${size} sources without a runtime precision-budget limit`, () => {
      const layers = Array.from({ length: size }, (_, i) => ({ [`key${i}`]: i, last: i }));
      const merged = withDefaults(...layers);
      const configured = defaultsFor(layers[0])(...layers.slice(1));
      assert.equal(merged.key0, 0);
      assert.equal(merged[`key${size - 1}`], size - 1);
      assert.equal(merged.last, size - 1);
      assert.equal(Object.keys(merged).length, size + 1);
      assert.deepEqual(configured, merged);
    });
  }

  check('canonical numeric keys override one another in either order', () => {
    assert.deepEqual(withDefaults({ 1: 42 }, { 1: 'last' }), { 1: 'last' });
    assert.deepEqual(withDefaults({ 1: 'first' }, { 1: 42 }), { 1: 42 });
    assert.deepEqual(defaultsFor({ 1: 42 })({ 1: undefined }), { 1: 42 });
    assert.deepEqual(withDefaults({ [-1]: false }, { '-1': 'last' }), { '-1': 'last' });
    assert.deepEqual(withDefaults({ 1.5: false }, { 1.5: 42 }), { 1.5: 42 });
    assert.deepEqual(withDefaults({ 1: 42 }, { '01': 'distinct' }), { 1: 42, '01': 'distinct' });
  });

  check('numeric and string aliases still read each eligible accessor once', () => {
    let reads = 0;
    const merged = withDefaults(
      { 1: 42 },
      {
        get 1() {
          reads += 1;
          return reads === 1 ? 'last' : undefined;
        }
      }
    );
    assert.equal(reads, 1);
    assert.equal(merged[1], 'last');
    assert.equal(merged['1'], 'last');
  });
}
