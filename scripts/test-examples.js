'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function collect(directory = root) {
  const examples = [];

  for (const file of ['README.md', 'docs/API.md']) {
    const text = fs.readFileSync(path.join(directory, file), 'utf8');

    for (const [index, match] of [
      ...text.matchAll(/\x60\x60\x60(javascript|typescript)\r?\n([\s\S]*?)\x60\x60\x60/g)
    ].entries()) {
      examples.push({ name: file + ' example ' + (index + 1), language: match[1], code: match[2] });
    }
  }

  for (const file of fs.readdirSync(path.join(directory, 'src')).filter((file) => file.endsWith('.cjs'))) {
    const source = fs.readFileSync(path.join(directory, 'src', file), 'utf8');

    for (const [, block] of source.matchAll(/\/\*\*([\s\S]*?)\*\//g)) {
      const clean = block.replace(/^[ \t]*\* ?/gm, '');

      for (const [, code] of clean.matchAll(/@example\s*\n([\s\S]*?)(?=\n@\w|$)/g)) {
        examples.push({ name: file + ' JSDoc ' + examples.length, language: 'javascript', code: code.trim() });
      }
    }
  }

  return examples;
}

function instrument(code) {
  const ast = ts.createSourceFile('example.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS),
    statements = [],
    comments = new Map();

  assert.equal(ast.parseDiagnostics.length, 0, 'Invalid example syntax.');
  function comment(range) {
    if (range.kind === ts.SyntaxKind.SingleLineCommentTrivia) {
      const match = /^\/\/ => ([^\r\n]+)/.exec(code.slice(range.pos, range.end));

      if (match) comments.set(range.pos, match[1].trim());
    }
  }

  function visit(node) {
    for (const range of ts.getLeadingCommentRanges(code, node.pos) || []) comment(range);
    for (const range of ts.getTrailingCommentRanges(code, node.end) || []) comment(range);
    if (ts.isExpressionStatement(node) || ts.isVariableStatement(node) || ts.isReturnStatement(node))
      statements.push(node);
    ts.forEachChild(node, visit);
  }

  visit(ast);
  const edits = [];
  let assertions = 0,
    errorAssertions = 0;

  for (const [position, expected] of [...comments].sort((a, b) => a[0] - b[0])) {
    const statement = statements
      .filter((node) => node.end <= position && /^\s*$/.test(code.slice(node.end, position)))
      .sort((a, b) => b.end - a.end || a.pos - b.pos)[0];

    assert.ok(statement, 'No statement for result: ' + expected);
    const start = statement.getStart(ast),
      end = statement.end;
    let replacement;

    if (expected.startsWith('rejects ')) {
      assert.match(expected, /^rejects [A-Za-z]*Error$/);
      replacement =
        'await __rejects(async () => { ' + code.slice(start, end) + ' }, ' + JSON.stringify(expected.slice(8)) + ');';
    } else if (expected.startsWith('throws ')) {
      assert.match(expected, /^throws [A-Za-z]*Error$/);
      replacement = '__throws(() => { ' + code.slice(start, end) + ' }, ' + JSON.stringify(expected.slice(7)) + ');';
      errorAssertions++;
    } else {
      const check = ts.createSourceFile(
        'expected.ts',
        'const result = (' + expected + ');',
        ts.ScriptTarget.Latest,
        true
      );

      assert.equal(check.parseDiagnostics.length, 0, 'Invalid expected result: ' + expected);
      let expression;

      if (ts.isVariableStatement(statement)) {
        assert.equal(statement.declarationList.declarations.length, 1);
        expression = statement.declarationList.declarations[0].name.getText(ast);
        replacement = code.slice(start, end) + '\n__equal(' + expression + ', (' + expected + '));';
      } else if (ts.isReturnStatement(statement)) {
        expression = statement.expression ? statement.expression.getText(ast) : 'void 0';
        replacement = 'return __equal((' + expression + '), (' + expected + '));';
      } else {
        expression = statement.expression.getText(ast);
        if (/^console\.log\(/.test(expression)) replacement = '__log(() => ' + expression + ', (' + expected + '));';
        else replacement = '__equal((' + expression + '), (' + expected + '));';
      }
    }

    assert.ok(!edits.some((edit) => edit.start === start), 'Repeated annotation for one statement.');
    edits.push({ start, end, text: replacement });
    assertions++;
  }

  let output = code;

  for (const edit of edits.sort((a, b) => b.start - a.start))
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);

  return { code: output, assertions, errorAssertions };
}

function runExample(example, directory = root, consumerDirectory = directory, format) {
  const marked = instrument(example.code);
  const completion = 'GO_DEFAULTS_EXAMPLE_' + randomBytes(24).toString('hex') + ':';
  let code = marked.code;

  if (example.language === 'typescript')
    code = ts
      .transpileModule(code, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
      })
      .outputText.replace(/^export \{\};?\s*$/gm, '');
  if (format === 'esm')
    code = code.replace(
      /const (\w+|\{[^}]+\}) = require\((['"])(go-defaults(?:\/[^'"]+)?)\2\);/g,
      'import $1 from "$3";'
    );
  const esm = format === 'esm' || /^\s*import\b/m.test(code);
  const prelude = esm
    ? 'import __assert from "node:assert/strict";\n'
    : 'const __assert = require("node:assert/strict");\n';
  const globals = '';
  const runtime = [
    'let __checks = 0;',
    'function __equal(actual, expected) { __assert.deepStrictEqual(actual, expected); __checks++; return actual; }',
    'async function __rejects(fn, name) { await __assert.rejects(fn, error => error.name === name); __checks++; }',
    'function __throws(fn, name) { __assert.throws(fn, error => error.name === name); __checks++; }',
    'function __log(fn, expected) {',
    '  const original = console.log, logs = [];',
    '  console.log = (...args) => logs.push(args);',
    '  try { fn(); } finally { console.log = original; }',
    '  __assert.equal(logs.length, 1); __assert.equal(logs[0].length, 1); __equal(logs[0][0], expected);',
    '}'
  ].join('\n');
  const imports = [];

  if (esm)
    code = code.replace(/^\s*import[^\n]+;\s*$/gm, (line) => {
      imports.push(line);

      return '';
    });
  const body =
    runtime +
    '\n' +
    (esm ? '' : globals) +
    code +
    '\n__assert.equal(__checks, ' +
    marked.assertions +
    ');\nprocess.stdout.write("\\n" + ' +
    JSON.stringify(completion) +
    ' + __checks + "\\n");';
  const program =
    prelude +
    (esm ? globals + imports.join('\n') : '') +
    '\n(async () => {\n' +
    body +
    '\n})().catch(error => { console.error(error); process.exitCode = 1; });';
  const result = spawnSync(
    process.execPath,
    ['--unhandled-rejections=strict', '--input-type=' + (esm ? 'module' : 'commonjs'), '-e', program],
    {
      // Resolve local examples through the generated consumer manifest, just like installed checks.
      cwd: consumerDirectory === root ? path.join(root, 'package') : consumerDirectory,
      encoding: 'utf8',
      timeout: 10000
    }
  );

  if (result.error) throw result.error;
  assert.equal(result.status, 0, example.name + '\n' + result.stderr);
  const records = result.stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith(completion))
    .map((line) => line.slice(completion.length));

  assert.deepEqual(
    records,
    [String(marked.assertions)],
    example.name + '\nMissing or invalid completion record for documentation example.\n' + result.stderr
  );

  return Number(records[0]);
}

function runAll(directory = root, consumerDirectory = directory) {
  const examples = collect(directory);
  let assertions = 0;

  for (const example of examples) {
    assertions += runExample(example, directory, consumerDirectory);
    if (example.language === 'javascript' && !/^\s*import\b/m.test(example.code))
      assertions += runExample(example, directory, consumerDirectory, 'esm');
  }

  console.log(
    examples.length +
      ' documentation examples and ' +
      assertions +
      ' displayed-result checks passed across documented imports and native ESM.'
  );

  return {
    blocks: examples.length,
    examples: assertions,
    errorExamples: examples.reduce((n, example) => n + instrument(example.code).errorAssertions, 0)
  };
}

function typeSource(code) {
  return code
    .split('\n')
    .map((line) => {
      const rejected = /^\/\/ (.+;).*\/\/ (?:TypeScript error:|Rejected:)/.exec(line);

      if (rejected) {
        return '// @ts-expect-error Documented compile-time rejection.\n' + rejected[1];
      }

      return line;
    })
    .join('\n');
}

function checkTypes(
  directory = root,
  examples = collect(directory).filter((example) => example.language === 'typescript')
) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'go-defaults-doc-types-'));

  try {
    for (const [index, example] of examples.entries()) {
      const source = typeSource(example.code).replace(/(['"])go-defaults(?:\/([^'"]+))?\1/g, (_, quote, subpath) =>
        JSON.stringify(
          path
            .join(
              directory === root ? path.join(root, 'package') : directory,
              'dist',
              subpath ? subpath + '.mjs' : 'index.mjs'
            )
            .replace(/\\/g, '/')
        )
      );

      fs.writeFileSync(path.join(temporary, 'example-' + index + '.mts'), source);
    }

    for (const exact of [false, true]) {
      fs.writeFileSync(
        path.join(temporary, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            strict: true,
            noEmit: true,
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            exactOptionalPropertyTypes: exact,
            skipLibCheck: false
          }
        })
      );
      const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', temporary], {
        encoding: 'utf8',
        timeout: 20000
      });

      if (result.error) throw result.error;
      assert.equal(
        result.status,
        0,
        'Documentation types (exactOptionalPropertyTypes=' + exact + ')\n' + result.stdout + result.stderr
      );
    }
  } finally {
    assert.equal(path.dirname(temporary), os.tmpdir());
    fs.rmSync(temporary, { recursive: true, force: true });
  }

  console.log(examples.length + ' TypeScript examples compile with and without exactOptionalPropertyTypes.');
}

module.exports = { collect, instrument, runExample, runAll, checkTypes };
if (require.main === module) {
  runAll();
  checkTypes();
}
