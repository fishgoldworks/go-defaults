'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const targets = require('./targets.cjs');

for (const [label, { withDefaults, defaultsFor }] of targets) {
  const check = (name, body) => test(label + ': ' + name, body);
  check('rejects primitive layers at the start, middle and end', () => {
    const configure = defaultsFor({ retries: 3 });
    for (const invalid of [false, true, 0, -0, 123, NaN, Infinity, '', 'text', 1n, Symbol('layer')]) {
      for (const layers of [[invalid], [invalid, {}], [{}, invalid, {}], [{}, invalid]]) {
        assert.throws(() => withDefaults(...layers), TypeError);
        assert.throws(() => configure(...layers), TypeError);
      }
    }
  });

  check('rejects every function kind without invoking or coercing it', () => {
    let calls = 0;
    const ordinary = Object.assign(
      () => {
        calls++;
      },
      { enabled: true }
    );
    ordinary[Symbol.toPrimitive] =
      ordinary.toString =
      ordinary.valueOf =
        () => {
          calls++;
          return 'invalid';
        };
    const invalid = [ordinary, ordinary.bind(null), async () => {}, function* () {}, class Config {}];
    const revoked = Proxy.revocable(() => {}, {});
    revoked.revoke();
    invalid.push(
      revoked.proxy,
      new Proxy(ordinary, {
        get() {
          calls++;
          throw new Error('must not inspect a rejected function');
        },
        ownKeys() {
          calls++;
          throw new Error('must not enumerate a rejected function');
        },
        getPrototypeOf() {
          calls++;
          throw new Error('must not inspect the prototype');
        }
      })
    );
    for (const layer of invalid) {
      assert.throws(() => withDefaults({}, layer), TypeError);
      assert.throws(() => defaultsFor({})(layer), TypeError);
    }
    assert.equal(calls, 0);
  });

  check('accepts non-plain objects and copies only their enumerable own fields', () => {
    class Config {
      constructor() {
        this.retries = 3;
      }
      method() {}
    }
    const foreign = vm.runInNewContext('({ enabled: true })');
    const date = new Date(0);
    date.label = 'date';
    for (const merge of [withDefaults, defaultsFor({})]) {
      const result = merge(['item'], new Config(), foreign, date, new String('x'));
      assert.deepEqual(result, { 0: 'x', retries: 3, enabled: true, label: 'date' });
      assert.equal(Object.hasOwn(result, 'method'), false);
    }
  });

  check('validates in source order and stops before later getters', () => {
    for (const merge of [withDefaults, defaultsFor({})]) {
      const reads = [];
      assert.throws(
        () =>
          merge(
            {
              get first() {
                reads.push('first');
                return 1;
              }
            },
            false,
            {
              get later() {
                reads.push('later');
                return 2;
              }
            }
          ),
        TypeError
      );
      assert.deepEqual(reads, ['first']);
      const sentinel = new Error('getter failed first');
      assert.throws(
        () =>
          merge(
            {
              get first() {
                throw sentinel;
              }
            },
            false
          ),
        (error) => error === sentinel
      );
    }
  });

  test(`${label}: defaults validation never coerces rejected functions`, () => {
    let calls = 0;
    const sentinel = new Error('coercion must not run');
    const invalid = function () {};
    invalid[Symbol.toPrimitive] = () => {
      calls += 1;
      throw sentinel;
    };
    assert.throws(() => defaultsFor(invalid), TypeError);
    assert.equal(calls, 0);
  });

  test(`${label}: rejection avoids traps on callable proxies`, () => {
    const traps = [];
    const invalid = new Proxy(function () {}, {
      get(_target, key) {
        traps.push(key);
        throw new Error('unexpected read');
      }
    });
    assert.throws(() => defaultsFor(invalid), TypeError);
    assert.deepEqual(traps, []);
    const revoked = Proxy.revocable(function () {}, {});
    revoked.revoke();
    assert.throws(() => defaultsFor(revoked.proxy), TypeError);
  });

  test(`${label}: invalid default primitives produce TypeError`, () => {
    for (const value of [undefined, null, false, true, 0, -0, NaN, Infinity, '', 'x', 1n, Symbol('x')]) {
      assert.throws(() => defaultsFor(value), TypeError);
    }
  });

  test(`${label}: built-in instances copy only own enumerable data, not prototype methods`, () => {
    const samples = [
      [new Date(), 'getTime'],
      [new Map(), 'get'],
      [new Set(), 'has'],
      [/re/, 'exec'],
      [new Number(1), 'toFixed'],
      [Promise.resolve(), 'then'],
      [new ArrayBuffer(8), 'slice'],
      [new SharedArrayBuffer(8), 'slice'],
      [new DataView(new ArrayBuffer(8)), 'byteLength'],
      [new WeakMap(), 'get'],
      [new WeakSet(), 'has'],
      [new WeakRef({}), 'deref'],
      [new FinalizationRegistry(() => {}), 'register']
    ];
    for (const [instance, inheritedKey] of samples) {
      const copied = withDefaults(instance);
      assert.equal(Object.getPrototypeOf(copied), Object.prototype);
      assert.equal(Object.hasOwn(copied, inheritedKey), false);
      assert.equal(copied[inheritedKey], undefined, `${instance.constructor.name}.${inheritedKey}`);
      const viaFactory = defaultsFor(instance)();
      assert.equal(Object.hasOwn(viaFactory, inheritedKey), false);
      assert.equal(viaFactory[inheritedKey], undefined);
    }
    const boxed = withDefaults(new Boolean(true));
    assert.equal(boxed.valueOf(), boxed); // Object.prototype.valueOf, not Boolean.prototype.valueOf
  });

  test(`${label}: decorated instances still copy only eligible own data; plain records remain precise`, () => {
    const date = new Date();
    date.option = 7;
    Object.defineProperty(date, 'hidden', { value: 'secret', enumerable: false });
    const merged = withDefaults(date, { extra: true });
    assert.deepEqual(merged, { option: 7, extra: true });
    assert.equal(merged.getTime, undefined);
    assert.equal(merged.hidden, undefined);
    const byFactory = defaultsFor(date)({ option: undefined, extra: true });
    assert.deepEqual(byFactory, { option: 7, extra: true });
    const dataMethod = () => 3;
    assert.equal(withDefaults({ getTime: dataMethod }).getTime, dataMethod);
    assert.equal(withDefaults({ getTime: dataMethod }).getTime(), 3);
  });
}
