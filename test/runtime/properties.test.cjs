'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const targets = require('./targets.cjs');

for (const [label, { withDefaults, defaultsFor }] of targets) {
  const check = (name, body) => test(label + ': ' + name, body);
  check('copies __proto__ as an own data property without changing the output prototype', () => {
    const source = JSON.parse('{"__proto__":{"isAdmin":true}}');
    const merged = withDefaults({ theme: 'light' }, source);
    assert.equal(Object.getPrototypeOf(merged), Object.prototype);
    assert.equal(merged.isAdmin, undefined);
    assert.equal(Object.hasOwn(merged, '__proto__'), true);
    assert.deepEqual(Object.getOwnPropertyDescriptor(merged, '__proto__'), {
      value: source.__proto__,
      enumerable: true,
      writable: true,
      configurable: true
    });
    assert.equal({}.isAdmin, undefined);
  });

  check('defaultsFor also uses prototype-safe writes', () => {
    const defaults = JSON.parse('{"__proto__":{"unexpected":true},"a":1}');
    const values = JSON.parse('{"__proto__":null,"constructor":"data","prototype":4}');
    const merged = defaultsFor(defaults)(values);
    assert.equal(Object.getPrototypeOf(merged), Object.prototype);
    assert.equal(merged.unexpected, undefined);
    assert.equal(Object.hasOwn(merged, '__proto__'), true);
    assert.equal(merged.__proto__, null);
    assert.equal(merged.constructor, 'data');
    assert.equal(merged.prototype, 4);
  });

  check('reads a defined getter exactly once and copies that same value', () => {
    let reads = 0;
    const merged = withDefaults(
      { enabled: false },
      {
        get enabled() {
          return ++reads === 1 ? true : undefined;
        }
      }
    );
    assert.equal(reads, 1);
    assert.deepEqual(merged, { enabled: true });
  });

  check('reads an undefined getter once without replacing a default', () => {
    let reads = 0;
    const merged = withDefaults(
      { enabled: false },
      {
        get enabled() {
          reads += 1;
          return undefined;
        }
      }
    );
    assert.equal(reads, 1);
    assert.equal(merged.enabled, false);
  });

  check('copies enumerable symbols with the same undefined and null rules as strings', () => {
    const key = Symbol('option');
    const extra = Symbol('extra');
    const result = withDefaults({ [key]: 1 }, { [key]: undefined, [extra]: 2 });
    assert.equal(result[key], 1);
    assert.equal(result[extra], 2);
    assert.equal(withDefaults(result, { [key]: null })[key], null);
    assert.equal(withDefaults(result, { [key]: 3 })[key], 3);
    assert.equal(defaultsFor({ [key]: 1 })({ [key]: 4 })[key], 4);
  });

  check('skips inherited and non-enumerable properties without evaluating their getters', () => {
    const symbol = Symbol('hidden');
    const input = Object.create({ inherited: 1 });
    Object.defineProperty(input, 'hidden', {
      get() {
        return assert.fail('hidden getter');
      }
    });
    Object.defineProperty(input, symbol, {
      get() {
        return assert.fail('symbol getter');
      }
    });
    input.own = 2;
    assert.deepEqual(withDefaults(input), { own: 2 });
  });

  check('a symbol getter is also evaluated only once', () => {
    const symbol = Symbol('getter');
    let reads = 0;
    const input = {
      get [symbol]() {
        reads += 1;
        return 5;
      }
    };
    const merged = withDefaults(input);
    assert.equal(reads, 1);
    assert.equal(merged[symbol], 5);
  });

  check('checks enumerability when each key is reached after accessor side effects', () => {
    const input = {
      get first() {
        delete this.removed;
        Object.defineProperty(this, 'hidden', { enumerable: false });
        this.added = 4;
        return 1;
      },
      removed: 2,
      hidden: 3
    };
    assert.deepEqual(withDefaults(input), { first: 1 });
  });

  check('copies accessors to mutable own data properties', () => {
    const input = Object.freeze({
      get value() {
        return 3;
      }
    });
    const merged = withDefaults(input);
    assert.deepEqual(Object.getOwnPropertyDescriptor(merged, 'value'), {
      value: 3,
      writable: true,
      enumerable: true,
      configurable: true
    });
    merged.value = 4;
    assert.equal(merged.value, 4);
  });

  check('retains null-prototype inputs and shadowed hasOwnProperty support', () => {
    const input = Object.create(null);
    input.hasOwnProperty = false;
    input.a = 1;
    input.missing = undefined;
    const merged = withDefaults(input);
    assert.equal(Object.getPrototypeOf(merged), Object.prototype);
    assert.deepEqual(merged, { hasOwnProperty: false, a: 1 });
  });

  test(`${label}: skipped prototype keys expose ordinary inherited values`, () => {
    for (const key of [
      'toString',
      'valueOf',
      'toLocaleString',
      'constructor',
      'hasOwnProperty',
      'isPrototypeOf',
      'propertyIsEnumerable',
      '__proto__'
    ]) {
      const source = { [key]: undefined };
      for (const merged of [withDefaults(source), defaultsFor(source)()]) {
        assert.equal(Object.hasOwn(merged, key), false);
        assert.equal(merged[key], {}[key]);
      }
      const merged = withDefaults({ [key]: 'copied' }, source);
      assert.equal(Object.hasOwn(merged, key), true);
      assert.equal(merged[key], 'copied');
    }
  });

  check('all standard prototype names may be overridden by non-functions', () => {
    const keys = Object.getOwnPropertyNames(Object.prototype);
    const source = Object.fromEntries(keys.map((key) => [key, 42]));
    for (const merged of [withDefaults(source), defaultsFor(source)()]) {
      assert.equal(Object.getPrototypeOf(merged), Object.prototype);
      for (const key of keys) {
        assert.equal(Object.hasOwn(merged, key), true);
        assert.equal(merged[key], 42);
      }
    }
  });

  test(`${label}: cross-realm sources and sparse inherited array indexes preserve own-only shallow copying`, () => {
    const foreign = vm.runInNewContext(`(() => {
      const nested = { foreign: true };
      const sparse = [ , 'own' ];
      const prototype = Object.create(Array.prototype);
      prototype[0] = 'inherited';
      Object.setPrototypeOf(sparse, prototype);
      return { sparse, source: { nested, own: 3 }, nested };
    })()`);
    const symbol = Symbol('foreign addition');
    const expected = { 1: 'own', nested: foreign.nested, own: 3, [symbol]: null };
    for (const value of [
      withDefaults(foreign.sparse, foreign.source, { [symbol]: null }),
      defaultsFor(foreign.sparse)(foreign.source, { [symbol]: null })
    ]) {
      assert.equal(Object.getPrototypeOf(value), Object.prototype);
      assert.deepEqual(Reflect.ownKeys(value), ['1', 'nested', 'own', symbol]);
      assert.equal(Object.hasOwn(value, '0'), false);
      assert.equal(value.nested, foreign.nested);
      assert.deepEqual(value, expected);
      assert.deepEqual(Object.getOwnPropertyDescriptor(value, '1'), {
        value: 'own',
        writable: true,
        enumerable: true,
        configurable: true
      });
    }
  });

  check('a getter installing an inherited setter cannot intercept a new destination key', () => {
    const key = Symbol('late setter');
    let writes = 0;
    let output;
    const source = {
      get [key]() {
        Object.defineProperty(Object.prototype, key, {
          __proto__: null,
          configurable: true,
          set() {
            writes += 1;
          }
        });
        return 7;
      }
    };
    try {
      output = withDefaults(source);
    } finally {
      delete Object.prototype[key];
    }
    assert.equal(writes, 0);
    assert.equal(output[key], 7);
    assert.equal(Object.hasOwn(output, key), true);
  });

  check('an existing own data property stays safe after a later source changes the prototype', () => {
    const key = Symbol('overwrite setter');
    let writes = 0;
    let output;
    const overrides = {
      get [key]() {
        Object.defineProperty(Object.prototype, key, {
          __proto__: null,
          configurable: true,
          set() {
            writes += 1;
          }
        });
        return 9;
      }
    };
    try {
      output = withDefaults({ [key]: 1 }, overrides);
    } finally {
      delete Object.prototype[key];
    }
    assert.equal(output[key], 9);
    assert.equal(writes, 0);
    assert.equal(Object.getOwnPropertyDescriptor(output, key).writable, true);
  });

  check('inherited non-writable and throwing-accessor properties are shadowed safely', () => {
    const keys = [Symbol('readonly'), Symbol('throwing getter')];
    let output;
    Object.defineProperty(Object.prototype, keys[0], { __proto__: null, value: -1, configurable: true });
    Object.defineProperty(Object.prototype, keys[1], {
      __proto__: null,
      get() {
        throw Error('must not read');
      },
      configurable: true
    });
    try {
      output = withDefaults({ [keys[0]]: 1, [keys[1]]: 2 }, { [keys[0]]: 3, [keys[1]]: 4 });
    } finally {
      for (const key of keys) delete Object.prototype[key];
    }
    assert.equal(output[keys[0]], 3);
    assert.equal(output[keys[1]], 4);
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(output, key);
      assert.equal(descriptor.writable, true);
      assert.equal(descriptor.enumerable, true);
      assert.equal(descriptor.configurable, true);
    }
  });

  check('safe-write descriptors ignore inherited get and set fields', () => {
    const getDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, 'get');
    const setDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, 'set');
    const source = JSON.parse('{"__proto__":1,"toString":2}');
    let output;
    try {
      Object.defineProperty(Object.prototype, 'get', {
        __proto__: null,
        configurable: true,
        value() {
          throw Error('inherited descriptor getter');
        }
      });
      Object.defineProperty(Object.prototype, 'set', {
        __proto__: null,
        configurable: true,
        value() {
          throw Error('inherited descriptor setter');
        }
      });
      output = withDefaults(source);
    } finally {
      delete Object.prototype.get;
      delete Object.prototype.set;
      if (getDescriptor) Object.defineProperty(Object.prototype, 'get', getDescriptor);
      if (setDescriptor) Object.defineProperty(Object.prototype, 'set', setDescriptor);
    }
    assert.equal(Object.getPrototypeOf(output), Object.prototype);
    assert.equal(output.__proto__, 1);
    assert.equal(output.toString, 2);
  });

  check('descriptor protection is rechecked after every source getter', () => {
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'get');
    const source = {
      constructor: 1,
      get toString() {
        Object.defineProperty(Object.prototype, 'get', {
          __proto__: null,
          configurable: true,
          value() {
            throw Error('late descriptor pollution');
          }
        });
        return 2;
      }
    };
    let output;
    try {
      output = withDefaults(source);
    } finally {
      delete Object.prototype.get;
      if (previous) Object.defineProperty(Object.prototype, 'get', previous);
    }
    assert.equal(output.constructor, 1);
    assert.equal(output.toString, 2);
    assert.equal(Object.getPrototypeOf(output), Object.prototype);
  });
}
