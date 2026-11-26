import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { ESLint } from 'eslint';
import * as prettier from 'prettier';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rules = ['jsdoc/lines-before-block', '@stylistic/padding-line-between-statements'];
const sample = `const LogLevel = (value, name) => ({ value, name });
/** OFF docs */
LogLevel.OFF = LogLevel(0, 'off'); // Previous member's note.
/** ALL docs */
LogLevel.ALL = LogLevel(1, 'all');
/** INFO docs */
LogLevel.INFO = LogLevel(300, 'info');
`;

// Physical fixtures let the complete typed configuration use its real project service.
function project(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'go-defaults-readability-'));

  fs.mkdirSync(path.join(directory, 'scripts'));
  fs.mkdirSync(path.join(directory, 'test'));
  fs.mkdirSync(path.join(directory, 'src'));
  for (const name of ['eslint.config.mjs', '.prettierrc.json', '.prettierignore', 'package.json']) {
    fs.copyFileSync(path.join(root, name), path.join(directory, name));
  }

  for (const name of ['readability.mjs', 'format.mjs']) {
    if (fs.existsSync(path.join(root, 'scripts', name))) {
      fs.copyFileSync(path.join(root, 'scripts', name), path.join(directory, 'scripts', name));
    }
  }

  fs.writeFileSync(
    path.join(directory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: 'ES2017',
        module: 'Node16',
        moduleResolution: 'Node16',
        jsx: 'preserve',
        types: []
      },
      include: ['test/**/*']
    })
  );
  const modules = path.join(directory, 'node_modules');

  fs.symlinkSync(path.join(root, 'node_modules'), modules, process.platform === 'win32' ? 'junction' : 'dir');
  t.after(() => {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    fs.unlinkSync(modules);
    fs.rmSync(directory, { recursive: true, force: true });
  });

  return directory;
}

function checker(directory, fix = false) {
  return new ESLint({
    cwd: directory,
    overrideConfigFile: path.join(directory, 'eslint.config.mjs'),
    cache: false,
    concurrency: 'off',
    fix: fix ? (message) => rules.includes(message.ruleId) : false
  });
}

async function cycle(directory, source, filename = 'src/readability-fixture.js') {
  const filepath = path.join(directory, filename);
  const options = JSON.parse(fs.readFileSync(path.join(root, '.prettierrc.json'), 'utf8'));
  const normalized = await prettier.format(source, { ...options, filepath });

  fs.writeFileSync(filepath, normalized);
  const [result] = await checker(directory, true).lintFiles([filepath]);
  const output = result.output || normalized;

  assert.equal(result.errorCount, 0, JSON.stringify(result.messages));
  assert.equal(result.warningCount, 0, JSON.stringify(result.messages));
  assert.equal(await prettier.format(output, { ...options, filepath }), output);

  return output;
}

test('real config rejects and fixes documented assignment separators, including trailing comments and multiline @see', async (t) => {
  const directory = project(t);
  const filename = path.join(directory, 'src/readability-fixture.js');

  fs.writeFileSync(filename, sample);
  const [before] = await checker(directory).lintFiles([filename]);

  assert.ok(before.messages.some((message) => message.ruleId === 'jsdoc/lines-before-block'));
  const output = await cycle(directory, sample);

  assert.match(output, /Previous member's note\.\n\n\/\*\* ALL docs \*\/\nLogLevel\.ALL/);
  assert.match(output, /all'\);\n\n\/\*\* INFO docs \*\/\nLogLevel\.INFO/);
  assert.equal(await cycle(directory, output), output);
  const multiline = sample.replace(
    /\/\*\* (OFF|ALL|INFO) docs \*\//g,
    (_, name) =>
      `/**\n * Built-in ${name} severity.\n * @see https://github.com/fishgoldworks/go-logs/blob/master/docs/API.md#level${name.toLowerCase()}\n */`
  );
  const documented = await cycle(directory, multiline);

  assert.match(documented, /Previous member's note\.\n\n\/\*\*\n \* Built-in ALL/);
  assert.match(documented, /#levelall\n \*\/\nLogLevel\.ALL/);
  assert.equal(await cycle(directory, documented), documented);
});

for (const extension of ['js', 'cjs', 'mjs', 'ts', 'cts', 'mts', 'd.ts', 'd.cts', 'd.mts']) {
  test('real language configuration and two-cycle readability for .' + extension, async (t) => {
    const directory = project(t);
    const filename = 'test/readability-fixture.' + extension;
    const declarations = extension.startsWith('d.');
    const typed = /(?:ts|tsx|cts|mts)$/.test(extension);
    const source = declarations
      ? `export interface Pair {\n/** First */\nfirst: number;\n/** Second */\nsecond: number;\n}\n`
      : typed
        ? `export const first = 1;\n/** Second\n * @see https://example.com\n */\nexport const second = first;\n`
        : sample;
    const output = await cycle(directory, source, filename);
    const config = await checker(directory).calculateConfigForFile(path.join(directory, filename));

    for (const id of rules) assert.equal(config.rules[id][0], 2);
    assert.equal(await cycle(directory, output, filename), output);
    assert.match(
      output,
      declarations
        ? /first: number;\n\n\s*\/\*\* Second/
        : typed
          ? /first = 1;\n\n\/\*\* Second/
          : /note\.\n\n\/\*\* ALL/
    );
    if (['js', 'cjs'].includes(extension)) assert.equal(config.languageOptions.sourceType, 'commonjs');
  });
}

test('related declarations and assertions remain compact; blocks and final returns separate', async (t) => {
  const directory = project(t);
  const output = await cycle(
    directory,
    `const values = [];\nconst actual = 1;\nconst expected = 1;\nvalues.push(actual);\nvalues.push(expected);\nfunction get() { const result = {}; result.ready = true; return result; }\nvoid get;\n`
  );

  assert.match(output, /const actual = 1;\nconst expected = 1;\n\nvalues/);
  assert.match(output, /values.push\(actual\);\nvalues.push\(expected\);/);
  assert.match(output, /result.ready = true;\n\n\s+return result;/);
  assert.match(output, /}\n\nvoid get;/);
});

test('container starts, overloads, inline casts and suppression targets remain stable', async (t) => {
  const directory = project(t);
  const source = `export interface Pair {\n/** First */\nfirst: number;\n/** Second */\nsecond: string;\n}\nexport function value(input: number): number;\nexport function value(input: string): string;\nexport function value(input: number | string): number | string { return input; }\nconst valueNumber = 1;\n// @ts-expect-error Intentional incompatible assignment.\nexport const text: string = valueNumber;\n`;
  const output = await cycle(directory, source, 'test/readability-fixture.ts');

  assert.match(output, /interface Pair \{\n\s+\/\*\* First/);
  assert.match(output, /function value\(input: number\): number;\nexport function value\(input: string\): string;/);
  assert.match(output, /@ts-expect-error Intentional incompatible assignment\.\nexport const text/);
  assert.equal(await cycle(directory, output, 'test/readability-fixture.ts'), output);
  const file = path.join(directory, 'test/target.ts');
  const diagnostics = (text) => {
    fs.writeFileSync(file, text);
    const program = ts.createProgram([file], { strict: true, noEmit: true, target: ts.ScriptTarget.ES2017, types: [] });

    return ts.getPreEmitDiagnostics(program).map((diagnostic) => diagnostic.code);
  };

  assert.deepEqual(diagnostics(source), []);
  assert.deepEqual(diagnostics(output), []);
  assert.ok(
    diagnostics(output.replace('// @ts-expect-error Intentional incompatible assignment.\n', '')).includes(2322)
  );
  assert.ok(diagnostics(output.replace('const text: string', 'const text: number')).includes(2578));
  const cast = await cycle(directory, 'const value = /** @type {number} */ (1);\nvoid value;\n');

  assert.match(cast, /= \/\*\* @type \{number\} \*\/ \(1\)/);
  const js = `const before = 1;\n// eslint-disable-next-line no-undef\nconst value = missing;\n/* node:coverage ignore next */\nif (value) { void before; }\n/*#if FEATURE*/\nvoid value;\n//#endif\n`;
  const formatted = await cycle(directory, js);

  assert.match(formatted, /eslint-disable-next-line no-undef\nconst value = missing/);
  assert.match(formatted, /node:coverage ignore next \*\/\nif/);
  assert.match(formatted, /\/\*#if FEATURE\*\/\nvoid value;\n\/\/#endif/);
});

function runFormat(directory, cwd = directory, args = [], nodeArgs = []) {
  return spawnSync(process.execPath, [...nodeArgs, path.join(directory, 'scripts/format.mjs'), ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60000
  });
}

test('actual CLI anchors its root, preserves excluded bytes and is stable on its second cycle', (t) => {
  const directory = project(t);

  fs.writeFileSync(path.join(directory, 'src/sample.js'), sample);
  const excluded = [
    'package/generated.js',
    '.tmp/negative.js',
    'temp/negative.js',
    'scripts/lib/check-library-readme.cjs'
  ];
  const bytes = 'intentionally   unformatted( );\n';

  for (const name of excluded) {
    fs.mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
    // The canonical checker remains linted for correctness, with only spacing excluded.
    fs.writeFileSync(path.join(directory, name), name.startsWith('scripts/') ? 'void  1;\n' : bytes);
  }

  fs.mkdirSync(path.join(directory, 'nested'));
  const first = runFormat(directory, path.join(directory, 'nested'));

  assert.equal(first.status, 0, first.stdout + first.stderr);
  const output = fs.readFileSync(path.join(directory, 'src/sample.js'), 'utf8');

  assert.match(output, /note\.\n\n\/\*\* ALL/);
  for (const name of excluded) {
    assert.equal(
      fs.readFileSync(path.join(directory, name), 'utf8'),
      name.startsWith('scripts/') ? 'void  1;\n' : bytes
    );
  }

  const second = runFormat(directory);

  assert.equal(second.status, 0, second.stdout + second.stderr);
  assert.equal(fs.readFileSync(path.join(directory, 'src/sample.js'), 'utf8'), output);
});

test('formatting reports unrelated fixable errors, preserves directives and always checks Prettier', (t) => {
  const directory = project(t);

  fs.writeFileSync(
    path.join(directory, 'src/sample.js'),
    '/* eslint-disable-next-line no-undef */\nconst ready = true;\nif (!!ready) { void ready; }\n'
  );
  const result = runFormat(directory);

  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /no-extra-boolean-cast/);
  assert.match(result.stdout, /Checking formatting/);
  const output = fs.readFileSync(path.join(directory, 'src/sample.js'), 'utf8');

  assert.match(output, /if \(!!ready\)/);
  assert.match(output, /eslint-disable-next-line no-undef/);
});

test('canonical checker retains correctness lint with a narrow spacing exception', async () => {
  const config = await checker(root).calculateConfigForFile(path.join(root, 'scripts/lib/check-library-readme.cjs'));

  assert.equal(config.rules['no-undef'][0], 2);
  for (const id of rules) assert.equal(config.rules[id][0], 0);
});

test('actual CLI executes through a directory junction and rejects unexpected arguments', (t) => {
  const directory = project(t);
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'readability-cli-alias-'));
  const alias = path.join(parent, 'project');

  fs.symlinkSync(directory, alias, process.platform === 'win32' ? 'junction' : 'dir');
  t.after(() => {
    fs.unlinkSync(alias);
    fs.rmdirSync(parent);
  });
  fs.writeFileSync(path.join(directory, 'src/sample.js'), sample);
  const result = runFormat(alias);

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Checking formatting/);
  assert.match(fs.readFileSync(path.join(directory, 'src/sample.js'), 'utf8'), /note\.\n\n\/\*\* ALL/);
  fs.writeFileSync(path.join(directory, 'src/sample.js'), sample);
  const preserved = runFormat(alias, alias, [], ['--preserve-symlinks-main']);

  assert.equal(preserved.status, 0, preserved.stdout + preserved.stderr);
  assert.match(preserved.stdout, /Checking formatting/);
  assert.match(fs.readFileSync(path.join(directory, 'src/sample.js'), 'utf8'), /note\.\n\n\/\*\* ALL/);
  fs.writeFileSync(path.join(directory, 'src/sample.js'), sample);
  const invalid = runFormat(directory, directory, ['--unexpected']);

  assert.equal(invalid.status, 1, invalid.stdout + invalid.stderr);
  assert.match(invalid.stderr, /Usage|argument/i);
  assert.equal(fs.readFileSync(path.join(directory, 'src/sample.js'), 'utf8'), sample);
});

test('padding preserves trailing next-line directive chains in nested and root statements', async (t) => {
  const directory = project(t);

  for (const comment of [
    '// eslint-disable-next-line no-undef',
    '/* eslint-disable-next-line no-undef */',
    '/* eslint-disable-next-line no-undef */ // trailing note',
    '/* first note */ /* eslint-disable-next-line no-undef */ // trailing note'
  ]) {
    for (const nested of [false, true]) {
      const body = `const before = 1; ${comment}\nvoid (before + missing);\n`;
      const source = nested ? `function read() {\n${body}}\nread();\n` : body;
      const output = await cycle(directory, source);

      assert.match(output, /const before = 1;\n\n\s*(?:\/\* first note \*\/ )?(?:\/\/|\/\*) eslint-disable-next-line/);
      assert.equal(await cycle(directory, output), output);
      const file = path.join(directory, 'src/readability-fixture.js');

      fs.writeFileSync(file, output.replace(comment, ''));
      const [control] = await checker(directory).lintFiles([file]);

      assert.ok(control.messages.some((message) => message.ruleId === 'no-undef'));
    }
  }
});

test('padding preserves trailing TypeScript suppression targets without weakening lint diagnostics', async (t) => {
  const directory = project(t);
  const filepath = path.join(directory, 'test/readability-fixture.ts');
  const options = JSON.parse(fs.readFileSync(path.join(root, '.prettierrc.json'), 'utf8'));

  for (const directive of ['@ts-expect-error', '@ts-ignore']) {
    const source = `export function read(): string {\n  const before = 1; // ${directive} Intentional incompatible assignment.\n  return before;\n}\n`;
    const normalized = await prettier.format(source, { ...options, filepath });

    fs.writeFileSync(filepath, normalized);
    const [result] = await checker(directory, true).lintFiles([filepath]);
    const output = result.output || normalized;

    assert.match(
      output,
      /const before = 1;\n\n\s*\/\/ @ts-(?:expect-error|ignore) Intentional incompatible assignment\.\n\s*return before;/
    );
    assert.deepEqual(
      result.messages.map((message) => message.ruleId),
      []
    );
    assert.equal(await prettier.format(output, { ...options, filepath }), output);
    const diagnostics = (text) => {
      fs.writeFileSync(filepath, text);
      const program = ts.createProgram([filepath], {
        strict: true,
        noEmit: true,
        target: ts.ScriptTarget.ES2017,
        types: []
      });

      return ts.getPreEmitDiagnostics(program).map((diagnostic) => diagnostic.code);
    };

    assert.deepEqual(diagnostics(source), []);
    assert.deepEqual(diagnostics(output), []);
    assert.ok(diagnostics(output.replace(`// ${directive} Intentional incompatible assignment.\n`, '')).includes(2322));
    fs.writeFileSync(filepath, output);
    const [again] = await checker(directory, true).lintFiles([filepath]);

    assert.equal(again.output || output, output);
    assert.deepEqual(
      again.messages.map((message) => message.ruleId),
      result.messages.map((message) => message.ruleId)
    );
  }
});

test('importing the private formatter from stdin remains harmless', (t) => {
  const directory = project(t);
  const file = path.join(directory, 'src/sample.js');
  const url = pathToFileURL(path.join(directory, 'scripts/format.mjs')).href;

  fs.writeFileSync(file, sample);
  const result = spawnSync(process.execPath, ['--input-type=module', '-'], {
    cwd: directory,
    input: `const formatter = await import(${JSON.stringify(url)}); console.log(typeof formatter.formatProject);`,
    encoding: 'utf8',
    timeout: 30000
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout.trim(), 'function');
  assert.equal(fs.readFileSync(file, 'utf8'), sample);
});

test('selected fixes preserve actual Node coverage directives and counted spans', async (t) => {
  const directory = project(t);
  const file = path.join(directory, 'coverage-target.cjs');
  const filepath = path.join(directory, 'src/readability-fixture.js');
  const options = JSON.parse(fs.readFileSync(path.join(root, '.prettierrc.json'), 'utf8'));
  const coverage = (source) => {
    fs.writeFileSync(file, source);
    const env = { ...process.env };

    delete env.NODE_TEST_CONTEXT;
    delete env.NODE_V8_COVERAGE;

    return spawnSync(
      process.execPath,
      [
        '--test',
        '--experimental-test-coverage',
        '--test-coverage-branches=100',
        '--test-coverage-include=coverage-target.cjs',
        file
      ],
      { cwd: directory, env, encoding: 'utf8', timeout: 30000 }
    );
  };

  for (const [comment, body] of [
    ['/* node:coverage ignore next */', 'const before = ready; MARKER\nreturn before ? before : false;'],
    ['/* node:coverage ignore next 2 */', 'const before = ready; MARKER\nreturn before ? before : false;'],
    ['/* node:coverage ignore next 2 */', 'MARKER\nconst before = ready;\nreturn before ? before : false;'],
    [
      '/* node:coverage ignore next 2 */',
      'const before = ready;\nMARKER\n/** Preserve branch. */\nreturn before ? before : false;'
    ]
  ]) {
    const source = `const assert = require('node:assert/strict');\nfunction read(ready) {\n${body.replace('MARKER', comment)}\n}\nassert.equal(read(true), true);\n`;
    const normalized = await prettier.format(source, { ...options, filepath: file });
    const before = coverage(normalized);

    fs.writeFileSync(filepath, normalized);
    const [result] = await checker(directory, true).lintFiles([filepath]);
    const output = result.output || normalized;
    const after = coverage(output);
    const control = coverage(output.replace(comment, ''));

    assert.ok(result.messages.length > 0, 'Unsafe spacing fixes must remain reported for explicit reconciliation');
    assert.ok(result.messages.every((message) => rules.includes(message.ruleId)));
    assert.equal(before.status, 0, before.stdout + before.stderr);
    assert.equal(after.status, 0, after.stdout + after.stderr);
    assert.equal(control.status, 1, control.stdout + control.stderr);
    assert.match(control.stdout + control.stderr, /branch coverage does not meet threshold/);
    fs.writeFileSync(filepath, output);
    const [again] = await checker(directory, true).lintFiles([filepath]);

    assert.equal(again.output || output, output);
    assert.equal(await prettier.format(output, { ...options, filepath: file }), output);
  }
});
