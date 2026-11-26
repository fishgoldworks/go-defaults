import * as fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { runtimeRunnerFixture as runnerFixture } from '../helpers/runtime-runner-fixture.mjs';

function runCoverage(directory) {
  return spawnSync(process.execPath, ['scripts/test.js', '--coverage'], {
    cwd: directory,
    encoding: 'utf8',
    timeout: 15000
  });
}

test('coverage ignores empty directories ending in JavaScript extensions', async (t) => {
  const directory = await runnerFixture(t);

  for (const name of ['empty.js', 'empty.cjs', 'empty.mjs', 'nested/empty.js'])
    await fs.mkdir(path.join(directory, 'src', name), { recursive: true });
  const result = runCoverage(directory);

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /# tests 1\b/);
});

test('coverage retains source modules beneath linked directories', async (t) => {
  const directory = await runnerFixture(t);
  const target = path.join(directory, 'linked-source');

  await fs.mkdir(target);
  await fs.symlink(target, path.join(directory, 'src/linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const empty = runCoverage(directory);

  assert.equal(empty.status, 0, empty.stdout + empty.stderr);
  await fs.writeFile(path.join(target, 'unloaded.cjs'), 'exports.value = 2;\n');
  const unloaded = runCoverage(directory);

  assert.equal(unloaded.status, 1, unloaded.stdout + unloaded.stderr);
  assert.match(unloaded.stderr, /Missing source coverage entry: src\/linked\/unloaded\.cjs/);
});

for (const folder of ['group.js', 'group.cjs', 'group.mjs', 'all files']) {
  test('coverage checks actual modules inside the directory ' + folder, async (t) => {
    const directory = await runnerFixture(t);
    const sourceDirectory = path.join(directory, 'src', folder);

    await fs.mkdir(sourceDirectory);
    await fs.writeFile(path.join(sourceDirectory, 'helper.cjs'), 'exports.value = 2;\n');
    await fs.appendFile(
      path.join(directory, 'test/covered.test.cjs'),
      '\ntest("covered nested source", () => assert.equal(require(' +
        JSON.stringify('../src/' + folder + '/helper.cjs') +
        ').value, 2));\n'
    );
    const covered = runCoverage(directory);

    assert.equal(covered.status, 0, covered.stdout + covered.stderr);
    assert.match(covered.stdout, /# tests 2\b/);
    await fs.writeFile(path.join(sourceDirectory, 'unloaded.mjs'), 'export const value = 3;\n');
    const unloaded = runCoverage(directory);

    assert.equal(unloaded.status, 1, unloaded.stdout + unloaded.stderr);
    assert.ok(unloaded.stderr.includes('Missing source coverage entry: src/' + folder + '/unloaded.mjs'));
  });
}

test('coverage runner accepts covered source and rejects an unloaded nested module', async (t) => {
  const directory = await runnerFixture(t);
  const runCoverage = () =>
    spawnSync(process.execPath, ['scripts/test.js', '--coverage'], {
      cwd: directory,
      encoding: 'utf8'
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
