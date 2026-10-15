'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const render = require('./docs.js');
const q = String.fromCharCode(96),
  fence = q.repeat(3);
const reference =
  '# Fixture API\n\n## Contents\n\n{{TOC}}\n\n## Examples\n\n### `example(value)`\n\nReturns a value.\n\n**Parameters**\n\n| Parameter | Type | Description |\n| --- | --- | --- |\n| ' +
  q +
  'value' +
  q +
  ' | ' +
  q +
  'number' +
  q +
  ' | Value. |\n\n**Returns:** ' +
  q +
  'number' +
  q +
  ' — The value.\n\n**Examples**\n\n' +
  fence +
  'javascript\nexample(1); // => 1\n' +
  fence +
  '\n';
test('both documents are generated and checked without writes, including cross-document anchors', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'go-defaults-docs-test-'));
  try {
    fs.mkdirSync(path.join(root, 'scripts'));
    fs.copyFileSync(path.join(__dirname, 'docs.js'), path.join(root, 'scripts/docs.js'));
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'fixture',
        version: '8.2.1',
        license: 'MIT',
        engines: { node: '>=22' },
        devDependencies: { typescript: '5.8.3' }
      })
    );
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src/index.cjs'), 'exports.example=value=>value;');
    fs.writeFileSync(path.join(root, 'scripts/API.template.md'), reference);
    fs.writeFileSync(
      path.join(root, 'scripts/README.template.md'),
      '# Fixture\n\n{{VERSION}} {{LICENSE}} {{API_COUNT}}\n\n## Contents\n\n{{TOC}}\n\n## API summary\n\n{{API_SUMMARY}}\n\n## Usage\n\nKeep authored prose.\n'
    );
    const run = (...args) => spawnSync(process.execPath, ['scripts/docs.js', ...args], { cwd: root, encoding: 'utf8' });
    const generated = run();
    assert.equal(generated.status, 0, generated.stderr);
    const file = path.join(root, 'README.md'),
      expected = fs.readFileSync(file, 'utf8');
    assert.match(expected, /8\.2\.1 MIT 1/);
    assert.match(expected, /docs\/API\.md#examplevalue/);
    assert.match(expected, /\[Usage\]\(#usage\)/);
    assert.match(expected, /Keep authored prose/);
    assert.doesNotMatch(expected, /\[Contents\]\(#contents\)/);
    assert.equal(run('--check').status, 0);
    for (const relative of ['README.md', 'docs/API.md']) {
      const full = path.join(root, relative),
        original = fs.readFileSync(full, 'utf8');
      fs.appendFileSync(full, 'stale\n');
      const stale = fs.readFileSync(full, 'utf8');
      const check = run('--check');
      assert.notEqual(check.status, 0);
      assert.match(check.stderr, /stale/);
      assert.equal(fs.readFileSync(full, 'utf8'), stale);
      fs.writeFileSync(full, original);
    }
    const apiTemplate = path.join(root, 'scripts/API.template.md');
    fs.appendFileSync(apiTemplate, '\n[Broken heading](../README.md#missing)\n');
    assert.notEqual(run().status, 0, 'Missing cross-document anchors must fail');
    assert.notEqual(run('--unknown').status, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('API coverage requires complete entries, not just summary rows', () => {
  const api = { example: () => 1 };
  const current = reference.replace('{{TOC}}', '');
  assert.match(render.summary(current, api), /examplevalue/);
  assert.throws(() => render.summary(current, { ...api, missing: () => 0 }), /Document public API/);
  assert.throws(() => render.summary(current.replace('**Parameters**', 'Parameters'), api), /parameters/);
  assert.throws(() => render.summary(current.replace('**Returns:**', 'Returns:'), api), /return contract/);
  assert.throws(() => render.summary(current.replace('**Examples**', 'Examples'), api), /examples/);
  assert.throws(() => render.summary(current + '\n### `example(value)`\n\nDuplicate.\n', api), /Duplicate/);
  const generic = current.replace(
    '### `example(value)`',
    '### ' + String.fromCharCode(96) + 'example<Value>(value)' + String.fromCharCode(96)
  );
  assert.match(render.summary(generic, api), /docs\/API\.md#examplevaluevalue/);
});
test('headings ignore fenced examples and disambiguate repeated names', () => {
  assert.deepEqual(
    render
      .headings('# Test\n\n## Same\n' + fence + 'javascript\n## Hidden\n' + fence + '\n## Same')
      .map((h) => h.anchor),
    ['test', 'same', 'same-1']
  );
});

test('result examples reject wrong values, thrown errors and promise rejections', () => {
  const { runExample, instrument } = require('./test-examples.js');
  const root = path.resolve(__dirname, '..');
  const example = {
    name: 'instrumentation probe',
    language: 'javascript',
    code: [
      "const { withDefaults, defaultsFor } = require('go-defaults');",
      'withDefaults({ enabled: true }).enabled; // => true',
      'defaultsFor(1); // => throws TypeError',
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

test('source JSDoc references resolve to exported declaration types', () => {
  const ts = require('typescript'),
    root = path.resolve(__dirname, '..');
  const files = fs
    .readdirSync(path.join(root, 'src'))
    .filter((file) => file.endsWith('.cjs'))
    .map((file) => path.join(root, 'src', file));
  const program = ts.createProgram(files, {
    allowJs: true,
    checkJs: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext
  });
  const problems = [];
  for (const file of files) {
    const source = program.getSourceFile(file),
      comments = [];
    function visit(node) {
      if (node.jsDoc) comments.push(...node.jsDoc);
      ts.forEachChild(node, visit);
    }
    visit(source);
    for (const diagnostic of program.getSemanticDiagnostics(source))
      if (comments.some((c) => diagnostic.start >= c.pos && diagnostic.start < c.end))
        problems.push(path.basename(file) + ': ' + ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
  }
  assert.deepEqual(problems, []);
});
test('the TypeScript example checker detects a false compile-time rejection', () => {
  const example = {
    language: 'typescript',
    code: "import { withDefaults } from 'go-defaults';\n// withDefaults({}); // TypeScript error: deliberately false claim"
  };
  assert.throws(
    () => require('./test-examples.js').checkTypes(path.resolve(__dirname, '..'), [example]),
    /Unused '@ts-expect-error'/
  );
});
