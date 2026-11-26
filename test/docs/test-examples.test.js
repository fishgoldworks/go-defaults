'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { instrument, runExample, runAll, checkTypes } = require('../../scripts/test-examples.js');
const root = path.resolve(__dirname, '../..');

function run(code, format, language = 'javascript') {
  return runExample({ name: 'checker regression', language, code }, root, root, format);
}

for (const format of ['commonjs', 'esm']) {
  test(format + ': completed asynchronous examples report their executed checks', () => {
    assert.equal(run('const value = await Promise.resolve(3);\nvalue; // => 3', format), 1);
    assert.equal(run('console.log("completed without result annotations");', format), 0);
  });

  for (const stop of ['process.exit(0);', 'await new Promise(() => {});']) {
    test(format + ': unfinished examples fail before result checks: ' + stop, () => {
      assert.throws(() => run(stop + '\n1; // => 2', format), /checker regression.*completion/s);
    });

    test(format + ': unfinished examples fail after result checks: ' + stop, () => {
      assert.throws(() => run('1; // => 1\n' + stop, format), /checker regression.*completion/s);
    });

    test(format + ': completion is required even without annotations: ' + stop, () => {
      assert.throws(() => run(stop, format), /checker regression.*completion/s);
    });
  }

  test(format + ': nonzero exits still fail after completed result checks', () => {
    assert.throws(() => run('1; // => 1\nprocess.exitCode = 1;', format), /checker regression/);
  });

  test(format + ': annotated returns preserve values, identity, evaluation count and control flow', () => {
    const code = [
      "const { defaultIf } = require('go-defaults');",
      "const defaultValue = { title: 'Home' };",
      'let calls = 0;',
      'function makeTitle() {',
      '  return defaultIf((calls++, undefined), defaultValue); // => defaultValue',
      '  throw new Error("unreachable after return");',
      '}',
      'makeTitle() === defaultValue; // => true',
      'calls; // => 1',
      'function noValue(undefined) {',
      '  return; // => void 0',
      '  throw new Error("unreachable after bare return");',
      '}',
      'noValue(1); // => void 0',
      'async function loadTitle() {',
      "  return await Promise.resolve('Home'); // => 'Home'",
      '}',
      "await loadTitle(); // => 'Home'"
    ].join('\n');

    assert.equal(run(code, format), 7);
    assert.throws(() => run(code.replace('// => defaultValue', '// => null'), format), /checker regression/);
  });

  test(format + ': result annotations are comments, not string, template or block-comment data', () => {
    const code = [
      "const { defaultIf } = require('go-defaults');",
      'const doubleQuoted = "// => not a result";',
      "const singleQuoted = '// => throws TypeError';",
      'const template = `first line\n// => rejects TypeError\nlast line`;',
      'const expression = /[// => not a result]/;',
      '/* Block comment containing // => not a result */',
      'const interpolated = `${(() => {',
      '  return "Home"; // => "Home"',
      '})()}`;',
      'defaultIf(doubleQuoted, undefined) === doubleQuoted; // => true',
      '[singleQuoted.length > 0, template.length > 0, expression.test("/"), interpolated]; // => [true, true, true, "Home"]'
    ].join('\n');

    assert.equal(instrument(code).assertions, 3);
    assert.equal(run(code, format), 3);
    assert.throws(() => run(code.replace('// => true', '// => false'), format), /checker regression/);
  });
}

test('runAll reports only completed examples and does not print success for unfinished blocks', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'go-defaults-example-checker-'));
  const logs = [],
    original = console.log;

  try {
    fs.mkdirSync(path.join(temporary, 'docs'));
    fs.mkdirSync(path.join(temporary, 'src'));
    fs.writeFileSync(path.join(temporary, 'docs/API.md'), '# Fixture API\n');
    console.log = (message) => logs.push(message);
    for (const stop of ['', 'process.exit(0);', 'await new Promise(() => {});']) {
      fs.writeFileSync(
        path.join(temporary, 'README.md'),
        '```javascript\nconst marker = "// => throws TypeError";\n' + stop + '\n1; // => 1\n```\n'
      );
      logs.length = 0;
      if (stop) {
        assert.throws(() => runAll(temporary), /README.md example 1.*completion/s);
        assert.deepEqual(logs, []);
      } else {
        assert.deepEqual(runAll(temporary), { blocks: 1, examples: 2, errorExamples: 0 });
        assert.match(logs[0], /1 documentation examples and 2 displayed-result checks passed/);
      }
    }
  } finally {
    console.log = original;
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('well-typed examples still require runtime completion after transpilation', () => {
  const example = {
    name: 'typed completion regression',
    language: 'typescript',
    code: 'await new Promise<void>(() => {});\nconst value: number = 1;\nvalue; // => 2'
  };

  checkTypes(root, [example]);
  for (const format of ['commonjs', 'esm'])
    assert.throws(() => runExample(example, root, root, format), /typed completion regression.*completion/s);
});

test('result examples reject wrong values, thrown errors and promise rejections', () => {
  const { runExample, instrument } = require('../../scripts/test-examples.js');
  const root = path.resolve(__dirname, '../..');
  const example = {
    name: 'instrumentation probe',
    language: 'javascript',
    code: [
      "const { withDefaults, createDefaultsMerger } = require('go-defaults');",
      'withDefaults({ enabled: true }).enabled; // => true',
      "createDefaultsMerger({ mergeDepth: '1' }); // => throws TypeError",
      'await Promise.reject(new TypeError()); // => rejects TypeError'
    ].join('\n')
  };

  assert.equal(instrument(example.code).assertions, 3);
  for (const format of [undefined, 'esm']) {
    assert.equal(runExample(example, root, root, format), 3);
    assert.throws(
      () => runExample({ ...example, code: example.code.replace('// => true', '// => false') }, root, root, format),
      /instrumentation probe/
    );
    assert.throws(
      () =>
        runExample(
          { ...example, code: example.code.replace('throws TypeError', 'throws RangeError') },
          root,
          root,
          format
        ),
      /instrumentation probe/
    );
    assert.throws(
      () =>
        runExample(
          { ...example, code: example.code.replace('rejects TypeError', 'rejects RangeError') },
          root,
          root,
          format
        ),
      /instrumentation probe/
    );
  }
});

test('the TypeScript example checker detects a false compile-time rejection', () => {
  const example = {
    language: 'typescript',
    code: "import { withDefaults } from 'go-defaults';\n// withDefaults({}); // TypeScript error: deliberately false claim"
  };

  assert.throws(
    () => require('../../scripts/test-examples.js').checkTypes(path.resolve(__dirname, '../..'), [example]),
    /Unused '@ts-expect-error'/
  );
});
