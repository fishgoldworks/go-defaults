const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const targets = require('./helpers/runtime-targets.cjs');

for (const [label, { createDefaultsMerger, withDefaults }] of targets) {
  const check = (name, body) => test(label + ': ' + name, body);

  check('omitting the options or individual settings gives the same shallow merge as withDefaults', () => {
    const defaults = { title: 'Home', unused: undefined, params: { foo: 1, bar: 2 } };
    const overrides = { title: undefined, subtitle: null, params: { foo: 3 } };

    for (const config of [undefined, {}, { shouldFallback: undefined, mergeDepth: undefined }, { mergeDepth: 0 }]) {
      const merge = createDefaultsMerger(config);
      const first = merge(defaults, overrides);

      assert.deepEqual(first, withDefaults(defaults, overrides));
      assert.deepEqual(merge(), {});
      assert.equal(first.params, overrides.params);
      assert.notEqual(first, merge(defaults, overrides));
    }
  });

  check('one merger reuses its options with different defaults and reads them on each call', () => {
    const options = { mergeDepth: 1, shouldFallback: (value) => value === null };
    const merge = createDefaultsMerger(options);
    const page = { params: { pageSize: 20 }, visible: false };
    const overrides = { params: { label: 'Details' }, visible: null };

    options.mergeDepth = 0;
    options.shouldFallback = () => false;
    assert.deepEqual(merge(page, overrides), { params: { pageSize: 20, label: 'Details' }, visible: false });
    assert.deepEqual(merge({ visible: true }, null, overrides), { params: overrides.params, visible: true });

    page.params.pageSize = 50;
    assert.deepEqual(merge(page, overrides), { params: { pageSize: 50, label: 'Details' }, visible: false });
  });

  check('the rule receives explicit undefined and enumerable string and symbol keys in order', () => {
    const token = Symbol('token');
    const seen = [];
    let reads = 0;
    const override = Object.assign(Object.create({ inherited: 1 }), { 2: false, title: undefined });

    Object.defineProperties(override, {
      [token]: {
        enumerable: true,
        get() {
          reads += 1;

          return null;
        }
      },
      hidden: { get: () => assert.fail('Read a non-enumerable property') }
    });
    const merge = createDefaultsMerger({
      shouldFallback(value, key) {
        seen.push([value, key]);

        return value === null;
      }
    });
    const result = merge({ [token]: 'default', title: 'Guide', baselineUndefined: undefined }, override, {
      title: null,
      newKey: undefined
    });

    assert.deepEqual(seen, [
      [false, '2'],
      [undefined, 'title'],
      [null, token],
      [null, 'title'],
      [undefined, 'newKey']
    ]);
    assert.equal(reads, 1);
    assert.deepEqual(result, { 2: false, [token]: 'default', title: undefined, newKey: undefined });
  });

  check('invalid options, depths, and predicate decisions throw', () => {
    for (const options of [null, 0, [], () => false]) {
      assert.throws(() => createDefaultsMerger(options), { name: 'TypeError', message: /options object/ });
    }

    for (const mergeDepth of [null, true, '1']) {
      assert.throws(() => createDefaultsMerger({ mergeDepth }), { name: 'TypeError', message: /mergeDepth/ });
    }

    for (const mergeDepth of [-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => createDefaultsMerger({ mergeDepth }), { name: 'RangeError', message: /mergeDepth/ });
    }

    for (const shouldFallback of [true, null]) {
      assert.throws(() => createDefaultsMerger({ shouldFallback }), { name: 'TypeError', message: /shouldFallback/ });
    }

    for (const decision of [undefined, null, 'skip', Promise.resolve(false), new Boolean(true)]) {
      const merge = createDefaultsMerger({ shouldFallback: () => decision });

      assert.throws(() => merge({}, { title: 'Guide' }), { name: 'TypeError', message: /boolean/ });
    }
  });

  check('depth is counted below the root and only colliding records are merged', () => {
    const defaults = { params: { bar: 2, display: { compact: true } } };
    const overrides = { params: { foo: 'foo', display: { colour: 'blue' } } };
    const depthOne = createDefaultsMerger({ mergeDepth: 1 })(defaults, overrides);

    assert.deepEqual(depthOne, { params: { bar: 2, foo: 'foo', display: { colour: 'blue' } } });
    assert.equal(depthOne.params.display, overrides.params.display);
    assert.deepEqual(createDefaultsMerger({ mergeDepth: 2 })(defaults, overrides), {
      params: { bar: 2, foo: 'foo', display: { compact: true, colour: 'blue' } }
    });
    assert.equal(createDefaultsMerger({ mergeDepth: 2 })({}, overrides).params, overrides.params);
    assert.equal(createDefaultsMerger({ mergeDepth: 2 })({ params: false }, overrides).params, overrides.params);
    assert.equal(createDefaultsMerger({ mergeDepth: 2 })(defaults).params, defaults.params);
  });

  check('nested fallback preserves earlier own undefined and skips new undefined with the built-in rule', () => {
    const custom = createDefaultsMerger({ mergeDepth: 1, shouldFallback: (value) => value === null });
    const builtIn = createDefaultsMerger({ mergeDepth: 1 });
    const result = custom(
      { params: { retries: 3 } },
      { params: { retries: undefined } },
      { params: { retries: null } }
    );

    assert.deepEqual(result, { params: { retries: undefined } });
    assert.equal(Object.hasOwn(result.params, 'retries'), true);
    assert.deepEqual(
      builtIn({ params: { earlier: undefined, max: 3 } }, { params: { max: undefined, new: undefined } }),
      {
        params: { earlier: undefined, max: 3 }
      }
    );
  });

  check('repeated nested overrides keep each result independent of its inputs and other branches', () => {
    const merge = createDefaultsMerger({ mergeDepth: 2 });
    const shared = Object.freeze({ style: Object.freeze({ font: 'serif' }) });
    const defaults = { left: shared, right: shared };
    const first = merge(
      defaults,
      { left: { style: { size: 12 } }, right: { style: { size: 14 } } },
      { left: { style: { colour: 'blue' } } }
    );
    const second = merge(first, { left: { style: { size: 16 } } }, { left: { style: { colour: 'red' } } });

    assert.deepEqual(first.left.style, { font: 'serif', size: 12, colour: 'blue' });
    assert.deepEqual(second.left.style, { font: 'serif', size: 16, colour: 'red' });
    assert.deepEqual(first.right.style, { font: 'serif', size: 14 });
    assert.equal(second.right, first.right);
    assert.notEqual(first.left.style, first.right.style);
    assert.deepEqual(shared.style, { font: 'serif' });
  });

  check('first-seen and depth-limited branches keep their references without reading children', () => {
    const failure = new Error('read a child');
    const display = {
      get colour() {
        throw failure;
      }
    };
    const defaults = { params: { display: { compact: true } } };
    const overrides = { params: { display } };

    assert.equal(createDefaultsMerger({ mergeDepth: 2 })({}, overrides).params, overrides.params);
    assert.equal(createDefaultsMerger({ mergeDepth: 1 })(defaults, overrides).params.display, display);
    assert.throws(
      () => createDefaultsMerger({ mergeDepth: 2 })(defaults, overrides),
      (error) => error === failure
    );
  });

  check('nested collisions copy only own enumerable entries and write special and symbol keys safely', () => {
    const token = Symbol('nested');
    const previous = Object.assign(Object.create(null), { [token]: 1 });
    const incoming = JSON.parse('{"__proto__":{"enabled":true},"constructor":3}');

    Object.defineProperty(previous, 'hidden', { get: () => assert.fail('Read hidden earlier property') });
    Object.defineProperty(incoming, 'hidden', { get: () => assert.fail('Read hidden incoming property') });
    const result = createDefaultsMerger({ mergeDepth: 1 })({ params: previous }, { params: incoming }).params;

    assert.equal(Object.getPrototypeOf(result), Object.prototype);
    assert.equal(Object.hasOwn(result, '__proto__'), true);
    assert.deepEqual(result.__proto__, { enabled: true });
    assert.equal(result.enabled, undefined);
    assert.equal(result.constructor, 3);
    assert.equal(result[token], 1);
    assert.equal(Object.hasOwn(result, 'hidden'), false);
  });

  check('arrays, native and foreign-realm objects remain whole values', () => {
    const merge = createDefaultsMerger({ mergeDepth: 2 });
    const arrayWithoutPrototype = Object.setPrototypeOf([1], null);

    class Settings {
      setting = true;
    }

    for (const value of [
      null,
      arrayWithoutPrototype,
      new Date(),
      new Map(),
      new Settings(),
      runInNewContext('({ a: 2 })')
    ]) {
      assert.equal(merge({ params: { a: 1 } }, { params: value }).params, value);
      assert.deepEqual(merge({ params: value }, { params: { a: 1 } }), { params: { a: 1 } });
    }
  });

  check('the predicate runs before descending and nested getters run depth-first', () => {
    const seen = [];
    const failure = new Error('nested getter failed');
    const untouched = new Proxy({}, { getPrototypeOf: () => assert.fail('Inspected a skipped branch') });
    const merge = createDefaultsMerger({
      mergeDepth: 1,
      shouldFallback(value, key) {
        seen.push(key);

        return key === 'ignored';
      }
    });
    const defaults = {
      params: {
        get first() {
          seen.push('read earlier');

          return 1;
        }
      },
      ignored: {}
    };
    const overrides = {
      ignored: untouched,
      get params() {
        seen.push('read params');

        return {
          get first() {
            seen.push('read incoming');
            throw failure;
          }
        };
      },
      get later() {
        return assert.fail('Read a later key');
      }
    };

    assert.throws(
      () => merge(defaults, overrides),
      (error) => error === failure
    );
    assert.deepEqual(seen, ['ignored', 'read params', 'params', 'read earlier', 'read incoming']);
    assert.throws(() => merge(0, overrides), { name: 'TypeError', message: /Source layers/ });
    assert.throws(
      () =>
        createDefaultsMerger({
          shouldFallback: () => {
            throw failure;
          }
        })({}, { title: 'Guide' }),
      (error) => error === failure
    );
  });

  check('cycles stop at the depth boundary and shared branches merge independently', () => {
    const earlier = { port: 80 };
    const incoming = { host: 'localhost' };

    earlier.next = earlier;
    incoming.next = incoming;
    const result = createDefaultsMerger({ mergeDepth: 2 })(
      { left: earlier, right: earlier },
      { left: incoming, right: incoming }
    );

    assert.notEqual(result.left, result.right);
    assert.notEqual(result.left.next, incoming);
    assert.equal(result.left.next.next, incoming);
    assert.equal(result.left.next.port, 80);
    assert.equal(result.right.next.host, 'localhost');

    const deep = createDefaultsMerger({ mergeDepth: 12000 })({ first: earlier }, { first: incoming });
    let branch = deep.first;

    for (let i = 0; i < 12000; i += 1) branch = branch.next;
    assert.equal(branch, incoming);
  });
}
