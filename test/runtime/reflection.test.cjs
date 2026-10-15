'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const targets = require('./targets.cjs');
const data = (value) => ({ __proto__: null, value, writable: true, enumerable: true, configurable: true });

// Deliberately simple oracle: no production fast path and no shared mutable state.
function referenceMerge(...sources) {
  const output = {};
  for (const source of sources) {
    if (source === null || typeof source !== 'object') continue;
    for (const key of Reflect.ownKeys(source)) {
      if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue;
      const value = source[key];
      if (value !== undefined) Object.defineProperty(output, key, data(value));
    }
  }
  return output;
}

for (const [label, { withDefaults, defaultsFor }] of targets) {
  const check = (name, body) => test(label + ': ' + name, body);
  test(`${label}: proxied receivers and dynamic enumerability preserve key snapshots and read ordering`, () => {
    function fixture() {
      const log = [];
      const target = {};
      const key = Symbol('revealed');
      Object.defineProperties(target, {
        first: {
          enumerable: true,
          configurable: true,
          get() {
            Object.defineProperty(target, 'second', { enumerable: false });
            Object.defineProperty(target, key, { enumerable: true });
            target.added = 4;
            return 1;
          }
        },
        second: { value: 2, enumerable: true, configurable: true },
        [key]: { value: 3, enumerable: false, configurable: true }
      });
      let proxy;
      proxy = new Proxy(target, {
        ownKeys(obj) {
          log.push('keys');
          return Reflect.ownKeys(obj);
        },
        getOwnPropertyDescriptor(obj, prop) {
          log.push(`own:${String(prop)}`);
          return Reflect.getOwnPropertyDescriptor(obj, prop);
        },
        get(obj, prop, receiver) {
          assert.equal(receiver, proxy);
          log.push(`get:${String(prop)}`);
          return Reflect.get(obj, prop, receiver);
        }
      });
      return { proxy, log, key };
    }
    for (const merge of [(proxy) => withDefaults(proxy), (proxy) => defaultsFor(proxy)()]) {
      const { proxy, log, key } = fixture();
      const result = merge(proxy);
      assert.deepEqual(Reflect.ownKeys(result), ['first', key]);
      assert.equal(result.first, 1);
      assert.equal(result[key], 3);
      assert.equal(Object.hasOwn(result, 'second'), false);
      assert.equal(Object.hasOwn(result, 'added'), false);
      assert.deepEqual(log, [
        'keys',
        'own:first',
        'get:first',
        'own:second',
        'own:Symbol(revealed)',
        'get:Symbol(revealed)'
      ]);
    }
  });

  test(`${label}: proxy descriptor failures short-circuit later input layers`, () => {
    const sentinel = new Error('descriptor failed');
    const trace = [];
    const source = new Proxy(
      { first: 1, second: 2 },
      {
        ownKeys(obj) {
          trace.push('keys');
          return Reflect.ownKeys(obj);
        },
        getOwnPropertyDescriptor(obj, key) {
          trace.push(`descriptor:${String(key)}`);
          if (key === 'second') throw sentinel;
          return Reflect.getOwnPropertyDescriptor(obj, key);
        },
        get(obj, key, receiver) {
          trace.push(`get:${String(key)}`);
          return Reflect.get(obj, key, receiver);
        }
      }
    );
    const later = {
      get late() {
        return assert.fail('later layer must not run');
      }
    };
    const mergeCases = [() => withDefaults(source, later), () => defaultsFor({ early: true })(source, later)];
    for (const merge of mergeCases) {
      trace.length = 0;
      assert.throws(merge, (error) => error === sentinel);
      assert.deepEqual(trace, ['keys', 'descriptor:first', 'get:first', 'descriptor:second']);
    }
  });

  check('source proxy trap order is unchanged and never consults its prototype', () => {
    const run = (merge) => {
      const trace = [];
      const key = Symbol.for('go-defaults-perf-symbol');
      const target = Object.defineProperties(
        {},
        {
          first: {
            enumerable: true,
            get() {
              trace.push('getter');
              delete target.removed;
              target.added = 5;
              return 1;
            }
          },
          removed: { enumerable: true, configurable: true, value: 2 },
          hidden: { value: 3 },
          [key]: { enumerable: true, value: 4 }
        }
      );
      const source = new Proxy(target, {
        ownKeys(object) {
          trace.push('keys');
          return Reflect.ownKeys(object);
        },
        getOwnPropertyDescriptor(object, property) {
          trace.push(`descriptor:${String(property)}`);
          return Reflect.getOwnPropertyDescriptor(object, property);
        },
        get(object, property, receiver) {
          trace.push(`get:${String(property)}`);
          return Reflect.get(object, property, receiver);
        },
        getPrototypeOf() {
          return assert.fail('source prototype must not be inspected');
        }
      });
      return { output: merge(source), trace };
    };
    assert.deepEqual(run(withDefaults), run(referenceMerge));
  });

  check('reentrant merges from getters cannot leak values between calls', () => {
    const nested = [];
    const source = {
      get value() {
        nested.push(withDefaults(JSON.parse('{"__proto__":"inner"}'), { value: 'inside' }));
        return 'outside';
      }
    };
    const output = defaultsFor({ value: 'default' })(source, JSON.parse('{"__proto__":"outer"}'));
    assert.equal(output.value, 'outside');
    assert.equal(output.__proto__, 'outer');
    assert.equal(nested[0].value, 'inside');
    assert.equal(nested[0].__proto__, 'inner');
    assert.notEqual(output, nested[0]);
  });

  check('source proxy failures propagate without evaluating later layers', () => {
    for (const trap of ['ownKeys', 'getOwnPropertyDescriptor', 'get']) {
      const sentinel = new Error(trap);
      const source = new Proxy(
        { a: 1 },
        {
          [trap]() {
            throw sentinel;
          }
        }
      );
      assert.throws(
        () =>
          withDefaults({ a: 0 }, source, {
            get b() {
              return assert.fail('later layer');
            }
          }),
        (error) => error === sentinel
      );
    }
  });

  check('1,000 generated merges match the slow data-property oracle', () => {
    let seed = 0x51f15e;
    const random = (max) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % max;
    };
    const keys = [
      'a',
      'b',
      'c',
      '1',
      '01',
      '__proto__',
      'constructor',
      'toString',
      'hasOwnProperty',
      Symbol('x'),
      Symbol('y')
    ];
    const shared = { nested: true };
    const values = [undefined, null, false, true, 0, -0, NaN, '', 'text', 42, shared];
    for (let i = 0; i < 1000; i += 1) {
      const sources = Array.from({ length: 1 + random(8) }, () => {
        const source = Object.create(random(2) ? null : { inherited: 9 });
        for (let j = 0, length = random(16); j < length; j += 1) {
          const descriptor = data(values[random(values.length)]);
          descriptor.enumerable = random(4) !== 0;
          Object.defineProperty(source, keys[random(keys.length)], descriptor);
        }
        return source;
      });
      const expected = referenceMerge(...sources);
      for (const actual of [withDefaults(...sources), defaultsFor(sources[0])(...sources.slice(1))]) {
        assert.equal(Object.getPrototypeOf(actual), Object.prototype);
        assert.deepEqual(Reflect.ownKeys(actual), Reflect.ownKeys(expected));
        assert.deepEqual(Object.getOwnPropertyDescriptors(actual), Object.getOwnPropertyDescriptors(expected));
        if (actual.a === shared) assert.equal(actual.a, shared);
      }
    }
  });
}
