const assert = require('node:assert/strict');
const { test } = require('node:test');

test('named helpers and subpaths share identity across module formats', async () => {
  const required = require('@fishgold/go-js');
  const imported = await import('@fishgold/go-js');
  const names = ['wait', 'result', 'isJson', 'parseBool', 'defaultsFor', 'withDefaults'];

  for (const name of names) {
    assert.equal(imported[name], required[name]);
    assert.equal(require(`@fishgold/go-js/${name}`), required[name]);
    assert.equal((await import(`@fishgold/go-js/${name}`)).default, required[name]);
  }

  assert.deepEqual(required.withDefaults({ a: 1 }, { a: undefined, b: null }), { a: 1, b: null });
});
