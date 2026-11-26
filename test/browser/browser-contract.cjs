// This function is executed unchanged in VM loaders and actual browser realms.
module.exports = function checkBrowserContract(api) {
  function check(condition, message) {
    if (!condition) throw new Error(message);
  }

  check(Object.keys(api).sort().join(',') === 'createDefaultsMerger,defaultIf,withDefaults', 'exact public API');
  const pageDefaults = { title: 'Home' };
  const mergeIgnoringNull = api.createDefaultsMerger({ shouldFallback: (value) => value === null });
  const page = mergeIgnoringNull(pageDefaults, { title: 'Guide' }, { title: null, label: null, visible: false });

  check(page.title === 'Guide' && page.visible === false && !('label' in page), 'custom fallback rule');
  const cleared = mergeIgnoringNull(pageDefaults, { title: undefined });

  check('title' in cleared && cleared.title === undefined, 'custom rule accepts explicit undefined');
  const mergedParams = api.createDefaultsMerger({ mergeDepth: 1 })(
    { params: { foo: 1, bar: 2 } },
    { params: { foo: 3 } }
  );

  check(mergedParams.params.foo === 3 && mergedParams.params.bar === 2, 'nested records merge below the root');
  check(api.createDefaultsMerger()(pageDefaults, { title: undefined }).title === 'Home', 'built-in factory fallback');
  check(api.defaultIf(undefined, 10) === 10, 'single-value fallback');
  check(api.defaultIf(undefined, undefined) === undefined, 'explicit undefined fallback');
  check(
    api.defaultIf(null, 10, (value) => value === null) === 10 &&
      api.defaultIf(undefined, 10, (value) => value === null) === undefined,
    'custom single-value fallback rule'
  );
  const explicitValues = [null, false, 0, -0, '', NaN, Symbol('value')];

  if (typeof BigInt === 'function') explicitValues.push(BigInt(5));
  for (const value of explicitValues) check(Object.is(api.defaultIf(value, 10), value), 'defined value identity');
  const selected = Object.freeze({});
  const factoryValue = () => {
    throw new Error('Function values must not be called');
  };

  const thenable = Object.defineProperty({}, 'then', {
    get() {
      throw new Error('Thenables must not be inspected');
    }
  });
  const revoked = Proxy.revocable({}, {});

  revoked.revoke();
  for (const value of [selected, factoryValue, thenable, revoked.proxy]) {
    check(api.defaultIf(undefined, value) === value && api.defaultIf(value, null) === value, 'whole-value selection');
  }

  let missingDefault;

  try {
    api.defaultIf();
  } catch (error) {
    missingDefault = error;
  }

  check(missingDefault instanceof TypeError, 'missing default throws TypeError');
  const nested = { name: 'shared' };
  const defaults = Object.freeze({ title: 'Home', visible: true, count: 10, note: 'Hello', nested });
  const result = api.withDefaults(
    defaults,
    { title: 'About' },
    {
      title: undefined,
      visible: false,
      count: 0,
      note: '',
      extra: null
    }
  );

  check(result.title === 'About' && result.visible === false && result.count === 0, 'ordered undefined-only defaults');
  check(result.note === '' && result.extra === null, 'explicit empty and null values');
  check(result !== defaults && result.nested === nested && defaults.visible === true, 'fresh shallow result');

  const token = Symbol('value');
  let reads = 0;
  const source = Object.create({ inherited: true });

  Object.defineProperties(source, {
    value: {
      enumerable: true,
      get() {
        reads++;

        return 7;
      }
    },
    hidden: { value: true }
  });
  Object.defineProperty(source, '__proto__', { enumerable: true, value: { safe: true } });
  source[token] = 'symbol';
  const copied = api.withDefaults(source);

  check(reads === 1 && copied.value === 7 && copied[token] === 'symbol', 'getters and symbols');
  check(!('inherited' in copied) && !('hidden' in copied), 'own enumerable properties only');
  check(Object.getPrototypeOf(copied) === Object.prototype && copied.__proto__.safe === true, 'safe prototype names');

  const sharedDefaults = { title: 'Home', count: 10 };
  const applyDefaults = api.createDefaultsMerger();

  sharedDefaults.title = 'About';
  check(applyDefaults(sharedDefaults, { count: undefined }).title === 'About', 'defaults read on every call');
  check(
    applyDefaults(sharedDefaults, { count: 0 }).count === 0 &&
      applyDefaults(sharedDefaults) !== applyDefaults(sharedDefaults),
    'reusable fresh results'
  );
  for (const invalid of [false, 1, 'text', () => {}]) {
    for (const invoke of [() => api.withDefaults({}, invalid), () => api.createDefaultsMerger()(invalid)]) {
      let error;

      try {
        invoke();
      } catch (caught) {
        error = caught;
      }

      check(error instanceof TypeError, 'invalid layers throw TypeError');
    }
  }

  const failure = new Error('getter failure');
  let propagated;

  try {
    api.withDefaults({
      get value() {
        throw failure;
      }
    });
  } catch (caught) {
    propagated = caught;
  }

  check(propagated === failure, 'getter error identity');

  return true;
};
