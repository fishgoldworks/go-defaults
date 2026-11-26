const assert = require('node:assert/strict');
const { test } = require('node:test');
const targets = require('./helpers/runtime-targets.cjs');

for (const [label, { defaultIf, withDefaults }] of targets) {
  const check = (name, body) => test(label + ': ' + name, body);

  check('defaultIf falls back only for undefined by default', () => {
    assert.equal(defaultIf(undefined, 'Home'), 'Home');
    assert.equal(defaultIf(undefined, undefined), undefined);
    assert.equal(defaultIf(undefined, 10, undefined), 10);
    assert.equal(defaultIf(undefined, 10, undefined, 'ignored'), 10);

    const values = ['Home', true, false, 0, -0, NaN, Infinity, -Infinity, '', null, Symbol('value')];

    if (typeof BigInt === 'function') values.push(BigInt(5));
    for (const value of values) assert.equal(defaultIf(value, 10), value);
  });

  check('a supplied predicate replaces the default test and receives the value once', () => {
    const received = [];
    const testNull = (value) => {
      received.push(value);

      return value === null;
    };

    assert.equal(defaultIf(null, 'Home', testNull), 'Home');
    assert.equal(defaultIf(undefined, 'Home', testNull), undefined);
    assert.equal(
      defaultIf('Guide', undefined, () => true),
      undefined
    );
    assert.deepEqual(received, [null, undefined]);
  });

  check('defaultIf requires both value arguments and a synchronous boolean predicate', () => {
    for (const args of [[], [undefined]]) {
      assert.throws(() => defaultIf(...args), TypeError);
    }

    for (const predicate of [null, true, 'test', {}]) {
      assert.throws(() => defaultIf(undefined, 10, predicate), TypeError);
    }

    for (const result of [undefined, 0, 'yes', new Boolean(true), Promise.resolve(true)]) {
      assert.throws(() => defaultIf(undefined, 10, () => result), TypeError);
    }

    const failure = new Error('predicate failed');
    const throwFailure = () => {
      throw failure;
    };

    assert.throws(
      () => defaultIf(undefined, 10, throwFailure),
      (error) => error === failure
    );
  });

  check('the selected object, function or promise is returned whole by reference', () => {
    const defaults = Object.freeze({ title: 'Home' });
    const supplied = Object.freeze({});

    assert.equal(defaultIf(supplied, defaults), supplied);
    assert.deepEqual(withDefaults(defaults, supplied), { title: 'Home' });
    const callback = () => {
      throw new Error('Function values must not be invoked');
    };

    const promise = Promise.resolve(25);

    for (const value of [defaults, supplied, [], callback, promise]) {
      assert.equal(defaultIf(undefined, value), value);
      assert.equal(defaultIf(value, null), value);
      assert.equal(
        defaultIf(null, value, (incoming) => incoming === null),
        value
      );
    }
  });

  check('defaultIf does not inspect selected or unselected values', () => {
    const throwOnRead = () => assert.fail('Inspected a value');
    const proxy = new Proxy({}, { get: throwOnRead });
    const revoked = Proxy.revocable({}, {});

    revoked.revoke();
    const thenable = Object.defineProperty({}, 'then', { get: throwOnRead });

    for (const value of [proxy, revoked.proxy, thenable]) {
      assert.equal(defaultIf(undefined, value), value);
      assert.equal(defaultIf(value, null), value);
      assert.equal(defaultIf(25, value), 25);
    }
  });

  check('the value and fallback are evaluated before the predicate runs', () => {
    const events = [];
    const source = {
      get count() {
        events.push('value');

        return 25;
      }
    };

    function createFallback() {
      events.push('fallback');

      return 10;
    }

    const result = defaultIf(source.count, createFallback(), (value) => {
      events.push('predicate');

      return value === undefined;
    });

    assert.equal(result, 25);
    assert.deepEqual(events, ['value', 'fallback', 'predicate']);
  });
}
