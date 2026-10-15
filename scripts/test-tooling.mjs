import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { replaceDirectory } from './replace-directory.mjs';
import { checkArtifacts } from './test-artifacts.mjs';
import { packageRoot, root } from './package-layout.mjs';
import { npm } from './process.mjs';
import { assertCoverageInventory } from './coverage-inventory.mjs';
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
for (const rollbackFails of [false, true]) {
  test(
    rollbackFails
      ? 'failed rollback retains and reports the previous complete output'
      : 'replacement failure restores the previous complete output',
    async (t) => {
      const directory = await temporary(t);
      const staged = path.join(directory, 'staged');
      const destination = path.join(directory, 'package');
      await fs.mkdir(staged);
      await fs.mkdir(destination);
      await fs.writeFile(path.join(destination, 'marker'), 'previous');
      const replacementError = new Error('replacement denied');
      const rollbackError = new Error('rollback denied');
      const operations = {
        ...fs,
        rename: async (source, target) => {
          if (source === staged) throw replacementError;
          if (rollbackFails && source === staged + '-previous') throw rollbackError;
          return fs.rename(source, target);
        }
      };
      await assert.rejects(replaceDirectory(staged, destination, operations), (error) => {
        if (!rollbackFails) return error === replacementError;
        assert.deepEqual(error.errors, [replacementError, rollbackError]);
        assert.ok(error.message.includes(staged + '-previous'));
        return true;
      });
      assert.equal(
        await fs.readFile(path.join(rollbackFails ? staged + '-previous' : destination, 'marker'), 'utf8'),
        'previous'
      );
    }
  );
}
test('successful replacement commits the new directory and removes the old backup', async (t) => {
  const directory = await temporary(t);
  const staged = path.join(directory, 'staged');
  const destination = path.join(directory, 'package');
  await fs.mkdir(staged);
  await fs.mkdir(destination);
  await fs.writeFile(path.join(staged, 'candidate'), 'new');
  await fs.writeFile(path.join(destination, 'previous'), 'old');
  await replaceDirectory(staged, destination);
  assert.equal(await fs.readFile(path.join(destination, 'candidate'), 'utf8'), 'new');
  await assert.rejects(fs.access(staged + '-previous'), { code: 'ENOENT' });
  await assert.rejects(fs.access(path.join(destination, 'previous')), { code: 'ENOENT' });
});
test('failure pruning the previous version reports the already committed destination', async (t) => {
  const directory = await temporary(t);
  const staged = path.join(directory, 'staged');
  const destination = path.join(directory, 'package');
  const previous = staged + '-previous';
  await fs.mkdir(staged);
  await fs.mkdir(destination);
  await fs.writeFile(path.join(staged, 'candidate'), 'new');
  await fs.writeFile(path.join(destination, 'previous'), 'old');
  const cleanupError = new Error('injected previous-output cleanup failure');
  const operations = {
    ...fs,
    rm: async (entry, options) => {
      if (entry === previous) throw cleanupError;
      return fs.rm(entry, options);
    }
  };
  await assert.rejects(replaceDirectory(staged, destination, operations), (error) => {
    assert.equal(error.committed, true, 'the error must say the new output is already live');
    assert.equal(error.cause, cleanupError);
    assert.equal(error.destination, destination);
    assert.equal(error.previousBackup, previous);
    assert.match(error.message, /cleanup/i);
    return true;
  });
  assert.equal(await fs.readFile(path.join(destination, 'candidate'), 'utf8'), 'new');
  assert.equal(await fs.readFile(path.join(previous, 'previous'), 'utf8'), 'old');
});
test('artifact validation rejects corrupted embedded source contents', async (t) => {
  const directory = await temporary(t);
  await fs.cp(packageRoot, directory, { recursive: true });
  const file = path.join(directory, 'dist/withDefaults.cjs.map');
  const map = JSON.parse(await fs.readFile(file, 'utf8'));
  map.sourcesContent[0] += '\n// stale source';
  await fs.writeFile(file, JSON.stringify(map));
  await assert.rejects(checkArtifacts(directory), /Source map content mismatch/);
});
test('an explicitly missing archive fails before installing or repacking', async (t) => {
  const directory = await temporary(t);
  const result = spawnSync(
    process.execPath,
    ['scripts/test-package.mjs', '--tarball', path.join(directory, 'missing.tgz')],
    { cwd: root, encoding: 'utf8' }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ENOENT/);
  assert.deepEqual(await fs.readdir(directory), []);
});
test('development packing and publication guards reject the wrong root', () => {
  const result = spawnSync(process.execPath, ['scripts/root-package-guard.js'], { cwd: root, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /private/);
});

test('ordinary npm pack invokes the private-root lifecycle guard', async (t) => {
  const directory = await temporary(t);
  assert.throws(
    () => npm(['pack', '--pack-destination', directory], root),
    (error) => {
      assert.match(String(error.stderr), /development root is private/);
      return error.status !== 0;
    }
  );
  assert.deepEqual(await fs.readdir(directory), []);
});

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
  for (const name of ['scripts', 'src', 'test/runtime'])
    await fs.mkdir(path.join(directory, name), { recursive: true });
  for (const name of ['test-contracts.mjs', 'coverage-inventory.mjs', 'package-layout.mjs', 'process.mjs'])
    await fs.copyFile(path.join(root, 'scripts', name), path.join(directory, 'scripts', name));
  await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ private: true }));
  await fs.writeFile(path.join(directory, 'src/index.cjs'), 'module.exports = { value: 1 };\n');
  await fs.writeFile(
    path.join(directory, 'test/runtime/covered.test.cjs'),
    "const { test } = require('node:test');\n" +
      "const assert = require('node:assert/strict');\n" +
      "test('covered source', () => assert.equal(require('../../src/index.cjs').value, 1));\n"
  );
  const environment = { ...process.env };
  // The nested runner must execute its own tests, not inherit this test worker's context.
  delete environment.NODE_TEST_CONTEXT;
  const runCoverage = () =>
    spawnSync(process.execPath, ['scripts/test-contracts.mjs', '--coverage'], {
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
