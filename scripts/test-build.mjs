import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, writeFile, readFile, rm, symlink, readdir, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'go-defaults-build-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const entry of ['src', 'types', 'scripts', 'package.json', 'README.md', 'docs', 'LICENSE.md', 'CHANGELOG.md']) {
    await cp(path.join(root, entry), path.join(directory, entry), { recursive: true });
  }
  await symlink(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'junction');
  return directory;
}
for (const [name, source] of [
  ['syntax', 'const = ;'],
  ['import', "throw Error('Broken import');"]
]) {
  test('a ' + name + ' failure preserves the previous complete distribution', async (t) => {
    const directory = await fixture(t);
    const manifest = JSON.parse(await readFile(path.join(root, 'package.json')));
    const output = path.join(directory, manifest.private ? 'package' : 'dist');
    await mkdir(output);
    await writeFile(path.join(output, 'previous.txt'), 'previous output');
    await writeFile(path.join(directory, name === 'import' ? 'src/withDefaults.mjs' : 'src/withDefaults.cjs'), source);
    const result = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: directory, encoding: 'utf8' });
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.equal(await readFile(path.join(output, 'previous.txt'), 'utf8'), 'previous output');
    assert.ok(!(await readdir(directory)).some((file) => file.startsWith('.go-defaults-build-')));
  });
}
test('a successful build removes stale entries and creates a self-contained package', async (t) => {
  const directory = await fixture(t);
  await mkdir(path.join(directory, 'package'));
  await writeFile(path.join(directory, 'package/stale.js'), 'stale');
  const result = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: directory, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  await assert.rejects(access(path.join(directory, 'package/stale.js')));
  await access(path.join(directory, 'package/package.json'));
  const runtime = spawnSync(
    process.execPath,
    [
      '-e',
      "const assert = require('assert'); const common = require('./package/'); assert.strictEqual(common.withDefaults, require('./package/withDefaults'));"
    ],
    { cwd: directory, encoding: 'utf8' }
  );
  assert.equal(runtime.status, 0, runtime.stderr);
});

test('explicit source-copy diagnostic build replaces stale entries without substituting the normal build', async (t) => {
  const directory = await fixture(t);
  await mkdir(path.join(directory, 'package'));
  await writeFile(path.join(directory, 'package/stale.txt'), 'old');
  const result = spawnSync(process.execPath, ['scripts/build-untransformed.mjs'], {
    cwd: directory,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  await assert.rejects(access(path.join(directory, 'package/stale.txt')), { code: 'ENOENT' });
  const manifest = JSON.parse(await readFile(path.join(directory, 'package/package.json'), 'utf8'));
  assert.equal(manifest.engines.node, '>=22.16.0');
  await access(path.join(directory, 'package/dist/index.cjs.map'));
  assert.ok(!(await readdir(directory)).some((entry) => entry.startsWith('.go-defaults-build-')));
});
test('failed source-copy candidate import preserves the previous complete package', async (t) => {
  const directory = await fixture(t);
  await mkdir(path.join(directory, 'package'));
  await writeFile(path.join(directory, 'package/previous.txt'), 'previous output');
  await writeFile(path.join(directory, 'src/withDefaults.mjs'), "throw new Error('injected module failure');");
  const result = spawnSync(process.execPath, ['scripts/build-untransformed.mjs'], {
    cwd: directory,
    encoding: 'utf8'
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /injected module failure/);
  assert.equal(await readFile(path.join(directory, 'package/previous.txt'), 'utf8'), 'previous output');
  assert.ok(!(await readdir(directory)).some((entry) => entry.startsWith('.go-defaults-build-')));
});
for (const expression of ['undefined', 'null', 'false', '0', "''"]) {
  test('a falsy import failure preserves its exact value: ' + expression, async (t) => {
    const directory = await fixture(t);
    await mkdir(path.join(directory, 'package'));
    await writeFile(path.join(directory, 'package/previous.txt'), 'previous output');
    await writeFile(path.join(directory, 'src/withDefaults.mjs'), 'throw ' + expression + ';');
    const program =
      "import assert from 'node:assert/strict'; import { buildPackage } from './scripts/build.mjs'; let caught = false; try { await buildPackage(); } catch (error) { caught = true; assert.strictEqual(error, " +
      expression +
      "); } assert.ok(caught, 'build must reject');";
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', program], {
      cwd: directory,
      encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(await readFile(path.join(directory, 'package/previous.txt'), 'utf8'), 'previous output');
    assert.ok(!(await readdir(directory)).some((name) => name.startsWith('.go-defaults-build-')));
  });
}
test('cleanup failure retains a null import failure and the cleanup error', async (t) => {
  const directory = await fixture(t);
  await mkdir(path.join(directory, 'package'));
  await writeFile(path.join(directory, 'package/previous.txt'), 'previous output');
  await writeFile(path.join(directory, 'src/withDefaults.mjs'), 'throw null;');
  const program =
    "import assert from 'node:assert/strict'; import fs from 'node:fs/promises'; import path from 'node:path'; import { syncBuiltinESMExports } from 'node:module'; const remove = fs.rm; const cleanup = Error('injected cleanup'); fs.rm = async (dir, options) => { if (path.basename(dir).startsWith('.go-defaults-build-')) throw cleanup; return remove(dir, options); }; syncBuiltinESMExports(); const { buildPackage } = await import('./scripts/build.mjs'); await assert.rejects(buildPackage(), error => { assert.ok(error instanceof AggregateError); assert.deepEqual(error.errors, [null, cleanup]); return true; });";
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', program], {
    cwd: directory,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(await readFile(path.join(directory, 'package/previous.txt'), 'utf8'), 'previous output');
});

for (const script of ['build.mjs', 'build-untransformed.mjs']) {
  test(script + ' excludes temporary directories without deleting local experiments', async (t) => {
    const directory = await fixture(t);
    const scratchFiles = [
      'src/temp/nested/probe.cjs',
      'src/.tmp/nested/probe.mjs',
      'src/nested/temp/probe.js',
      'src/nested/.tmp/probe.txt',
      'types/temp/probe.d.cts',
      'types/.tmp/probe.d.mts'
    ];
    const content = 'This is a local experiment, not a package source.\n';
    for (const file of scratchFiles) {
      await mkdir(path.dirname(path.join(directory, file)), { recursive: true });
      await writeFile(path.join(directory, file), content);
    }
    const result = spawnSync(process.execPath, ['scripts/' + script], { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    for (const file of scratchFiles) {
      assert.equal(await readFile(path.join(directory, file), 'utf8'), content);
      const output = file.startsWith('types/') ? 'dist/' + file.slice('types/'.length) : file;
      await assert.rejects(access(path.join(directory, 'package', output)), { code: 'ENOENT' });
    }
    await access(path.join(directory, 'package/src/withDefaults.cjs'));
  });
}
