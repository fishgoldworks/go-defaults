// This function is executed unchanged in VM loaders and actual browser realms.
module.exports = function checkBrowserContract(api) {
  function check(condition, message) {
    if (!condition) throw new Error(message);
  }
  check(Object.keys(api).sort().join(',') === 'defaultsFor,withDefaults', 'exact public API');
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
  const applyDefaults = api.defaultsFor(sharedDefaults);
  sharedDefaults.title = 'About';
  check(applyDefaults({ count: undefined }).title === 'About', 'defaults read on every call');
  check(applyDefaults({ count: 0 }).count === 0 && applyDefaults() !== applyDefaults(), 'reusable fresh results');
  for (const invalid of [false, 1, 'text', () => {}]) {
    for (const invoke of [() => api.withDefaults({}, invalid), () => api.defaultsFor(invalid)]) {
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
