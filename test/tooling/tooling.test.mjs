import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { packageRoot, root } from '../../scripts/package-layout.mjs';
import { assertCoverageInventory } from '../../scripts/coverage-inventory.mjs';

test('CI uses read-only permissions, disposable credentials and pinned actions', async () => {
  const ci = await fs.readFile(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  assert.match(ci, /^permissions:[ \t]*\r?\n[ \t]+contents:[ \t]*read[ \t]*$/m);
  assert.doesNotMatch(ci, /\b(pull_request_target|workflow_run)\b/);
  assert.doesNotMatch(ci, /^[ \t]*[\w-]+:[ \t]*(?:write|write-all)[ \t]*$/m);
  for (const match of ci.matchAll(/^[ \t]*- uses: (\S+)/gm)) {
    const action = match[1];
    if (action.startsWith('./')) continue;
    assert.match(action, /^[^@]+@[0-9a-f]{40}$/i, 'External action must use a full commit SHA');
    if (action.startsWith('actions/checkout@')) {
      const following = ci.slice(match.index + match[0].length);
      const nextStep = following.search(/^[ \t]*- (?:uses|run|name|if): /m);
      const ownStep = nextStep === -1 ? following : following.slice(0, nextStep);
      assert.match(ownStep, /^[ \t]+persist-credentials:[ \t]*false[ \t]*$/m);
    }
  }
});

async function temporary(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'go-defaults-recovery-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

test('benchmark accepts a package directory beside package.json and a direct entry file', async (t) => {
  const directory = await temporary(t);
  const result = spawnSync(
    process.execPath,
    [
      'scripts/benchmark.mjs',
      '--baseline',
      packageRoot,
      '--candidate',
      path.join(packageRoot, 'dist/index.cjs'),
      '--rounds',
      '5',
      '--sample-ms',
      '5',
      '--out',
      path.join(directory, 'result.json')
    ],
    { cwd: root, encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(await fs.readFile(path.join(directory, 'result.json'), 'utf8'));
  assert.equal(report.paths.baseline, packageRoot);
  assert.ok(report.results.length > 0);
  assert.ok(report.results.every((result) => result.samples.length === 5));
});

test('coverage inventory detects source modules missing from an otherwise green report', () => {
  const report = [
    '# start of coverage report',
    '# file | line % | branch % | funcs % | uncovered lines',
    '# src | | | |',
    '#  index.cjs | 100.00 | 100.00 | 100.00 |',
    '#  nested | | | |',
    '#   helper.mjs | 100.00 | 100.00 | 100.00 |',
    '# all files | 100.00 | 100.00 | 100.00 |',
    '# end of coverage report'
  ].join('\n');
  assert.doesNotThrow(() => assertCoverageInventory(report, ['src/index.cjs', 'src/nested/helper.mjs']));
  assert.throws(
    () => assertCoverageInventory(report, ['src/index.cjs', 'src/nested/helper.mjs', 'src/untested.cjs']),
    /Missing source coverage entry: src\/untested\.cjs/
  );
  assert.throws(
    () => assertCoverageInventory('No coverage report', ['src/index.cjs']),
    /Missing or malformed coverage report/
  );
});

test('coverage runner accepts covered source and rejects an unloaded nested module', async (t) => {
  // A checkout may itself be inside a temporary parent directory.
  const directory = path.join(await temporary(t), 'temp', 'fixture');
  await fs.mkdir(directory, { recursive: true });
  for (const name of ['scripts', 'src', 'test', 'test/helpers'])
    await fs.mkdir(path.join(directory, name), { recursive: true });
  for (const name of ['test.js', 'coverage-inventory.mjs', 'package-layout.mjs', 'process.mjs'])
    await fs.copyFile(path.join(root, 'scripts', name), path.join(directory, 'scripts', name));
  await fs.copyFile(
    path.join(root, 'test/helpers/runtime-files.cjs'),
    path.join(directory, 'test/helpers/runtime-files.cjs')
  );
  await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ private: true }));
  await fs.writeFile(path.join(directory, 'src/index.cjs'), 'module.exports = { value: 1 };\n');
  await fs.writeFile(
    path.join(directory, 'test/covered.test.cjs'),
    "const { test } = require('node:test');\n" +
      "const assert = require('node:assert/strict');\n" +
      "test('covered source', () => assert.equal(require('../src/index.cjs').value, 1));\n"
  );
  const environment = { ...process.env };
  // The nested runner must execute its own tests, not inherit this test worker's context.
  delete environment.NODE_TEST_CONTEXT;
  const runCoverage = () =>
    spawnSync(process.execPath, ['scripts/test.js', '--coverage'], {
      cwd: directory,
      encoding: 'utf8',
      env: environment
    });
  for (const file of [
    'src/temp/experiment.js',
    'src/.tmp/experiment.cjs',
    'src/nested/temp/experiment.mjs',
    'src/nested/.tmp/experiment.js'
  ]) {
    await fs.mkdir(path.dirname(path.join(directory, file)), { recursive: true });
    await fs.writeFile(path.join(directory, file), 'Unfinished experiment.\n');
  }
  const covered = runCoverage();
  assert.equal(covered.status, 0, covered.stdout + covered.stderr);
  assert.match(covered.stdout, /# tests 1\b/);
  await fs.mkdir(path.join(directory, 'src/nested'), { recursive: true });
  await fs.writeFile(path.join(directory, 'src/nested/unloaded.cjs'), 'module.exports = () => 2;\n');
  const unloaded = runCoverage();
  assert.equal(unloaded.status, 1, unloaded.stdout + unloaded.stderr);
  assert.match(unloaded.stderr, /Missing source coverage entry: src\/nested\/unloaded\.cjs/);
});
