import assert from 'node:assert/strict';
import { watch } from 'node:fs';
import { once } from 'node:events';
import {
  appendFile,
  cp,
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rename,
  rm,
  rmdir,
  stat,
  lstat,
  symlink,
  readdir,
  access
} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { comparePackage } from '../scripts/candidate.mjs';
import { npm } from '../scripts/process.mjs';
import { checkArtifacts } from '../scripts/test-artifacts.mjs';
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

function runScript(directory, ...args) {
  return spawnSync(process.execPath, args, {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, TMPDIR: directory, TEMP: directory, TMP: directory }
  });
}

async function fileState(directory, names) {
  return Promise.all(
    names.map(async (name) => {
      const file = path.join(directory, name);
      const { ino, mtimeMs } = await stat(file);

      return { ino, mtimeMs, bytes: await readFile(file) };
    })
  );
}

async function assertNoBuildStage(directory) {
  assert.ok(!(await readdir(directory)).some((name) => name.startsWith('.go-defaults-build-')));
}

test('build --check requires a package and leaves a current package and documentation untouched', async (t) => {
  const directory = await fixture(t);
  const generated = path.join(directory, 'package');
  const missing = runScript(directory, 'scripts/build.mjs', '--check');

  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /Missing generated directory: package\//);
  await assert.rejects(access(generated), { code: 'ENOENT' });
  await assertNoBuildStage(directory);

  const built = runScript(directory, 'scripts/build.mjs');

  assert.equal(built.status, 0, built.stdout + built.stderr);
  const previous = path.join(directory, 'previous-package');
  const files = ['README.md', 'docs/API.md', 'package/README.md', 'package/dist/defaultIf.d.cts'];

  for (const name of ['README.md', 'docs/API.md']) {
    const file = path.join(directory, name);

    await writeFile(file, (await readFile(file, 'utf8')).replace(/\n/g, '\r\n'));
  }

  const before = await fileState(directory, files);

  await cp(generated, previous, { recursive: true });
  const checkout = await stat(directory);
  const output = await stat(generated);

  assert.match(npm(['run', 'build', '--', '--check'], directory), /Generated package is current/);
  assert.equal((await stat(directory)).mtimeMs, checkout.mtimeMs);
  assert.equal((await stat(generated)).ino, output.ino);
  assert.deepEqual(await fileState(directory, files), before);
  await comparePackage(previous, generated);
  await assertNoBuildStage(directory);
});

test('build --check detects stale root documentation without regenerating it', async (t) => {
  const directory = await fixture(t);
  const files = ['README.md', 'docs/API.md'];
  const before = await fileState(directory, files);

  await appendFile(path.join(directory, 'scripts/README.template.md'), '\nFreshness regression fixture.\n');
  const staleDocs = runScript(directory, 'scripts/build.mjs', '--check');

  assert.notEqual(staleDocs.status, 0);
  assert.match(staleDocs.stderr, /README\.md is stale; run npm run docs/);
  assert.deepEqual(await fileState(directory, files), before);
  await assertNoBuildStage(directory);
});

test('test:artifacts stops at a stale packaged README and passes after rebuilding', async (t) => {
  const directory = await fixture(t);
  const generated = path.join(directory, 'package');

  await mkdir(path.join(directory, 'test/browser'), { recursive: true });
  for (const file of ['artifacts.test.mjs', 'browser/bundles.test.cjs', 'browser/browser-contract.cjs'])
    await cp(path.join(root, 'test', file), path.join(directory, 'test', file));
  const built = runScript(directory, 'scripts/build.mjs');

  assert.equal(built.status, 0, built.stdout + built.stderr);
  const previous = path.join(directory, 'previous-package');

  await cp(generated, previous, { recursive: true });
  await appendFile(path.join(directory, 'scripts/README.template.md'), '\nFreshness regression fixture.\n');
  const docs = runScript(directory, 'scripts/docs.js');

  assert.equal(docs.status, 0, docs.stdout + docs.stderr);
  assert.throws(
    () => npm(['run', 'test:artifacts'], directory),
    (error) => {
      assert.match(error.stderr, /Stale generated file: package\/README\.md/);
      assert.doesNotMatch(error.stdout, /source-map checks passed|go-defaults\.min\.js: standalone/);

      return true;
    }
  );
  await comparePackage(previous, generated);
  await assertNoBuildStage(directory);

  const rebuilt = runScript(directory, 'scripts/build.mjs');

  assert.equal(rebuilt.status, 0, rebuilt.stdout + rebuilt.stderr);
  assert.match(
    npm(['run', 'test:artifacts'], directory),
    /Generated package is current[\s\S]*source-map checks passed[\s\S]*go-defaults\.min\.js: standalone/
  );
});

test('build --check detects stale declarations without updating the generated package', async (t) => {
  const directory = await fixture(t);
  const built = runScript(directory, 'scripts/build.mjs');

  assert.equal(built.status, 0, built.stdout + built.stderr);
  const generated = path.join(directory, 'package');
  const previous = path.join(directory, 'previous-package');

  await cp(generated, previous, { recursive: true });
  await appendFile(path.join(directory, 'types/defaultIf.d.cts'), '\n// Freshness regression fixture.\n');
  const stale = runScript(directory, 'scripts/build.mjs', '--check');

  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /Stale generated file: package\/dist\/defaultIf\.d\.cts/);
  await comparePackage(previous, generated);
  await assertNoBuildStage(directory);
});

test('build --check reports unexpected and missing package paths without repairing them', async (t) => {
  const directory = await fixture(t);
  const built = runScript(directory, 'scripts/build.mjs');

  assert.equal(built.status, 0, built.stdout + built.stderr);
  const extra = path.join(directory, 'package/dist/unexpected');
  const missing = path.join(directory, 'package/dist/defaultIf.d.cts');

  await mkdir(extra);
  const unexpected = runScript(directory, 'scripts/build.mjs', '--check');

  assert.notEqual(unexpected.status, 0);
  assert.match(unexpected.stderr, /Unexpected generated path: package\/dist\/unexpected/);
  assert.ok((await stat(extra)).isDirectory());
  await rmdir(extra);
  await rm(missing);
  const absent = runScript(directory, 'scripts/build.mjs', '--check');

  assert.notEqual(absent.status, 0);
  assert.match(absent.stderr, /Missing generated file: package\/dist\/defaultIf\.d\.cts/);
  await assert.rejects(access(missing), { code: 'ENOENT' });
  await assertNoBuildStage(directory);
});

test('build --check rejects a linked generated directory even if its files are current', async (t) => {
  const directory = await fixture(t);
  const built = runScript(directory, 'scripts/build.mjs');

  assert.equal(built.status, 0, built.stdout + built.stderr);
  const output = path.join(directory, 'package/dist');
  const linked = path.join(directory, 'linked-dist');

  await rename(output, linked);
  await symlink(linked, output, 'junction');
  const result = runScript(directory, 'scripts/build.mjs', '--check');

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Expected a directory at package\/dist/);
  assert.ok((await lstat(output)).isSymbolicLink());
  await assertNoBuildStage(directory);
});

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

for (const script of ['build.mjs', 'build-untransformed.mjs']) {
  test(script + ' regenerates stale README and API documentation before packaging', async (t) => {
    const directory = await fixture(t);
    const documents = [
      ['README.md', 'README.template.md', 'Current README fixture content.'],
      ['docs/API.md', 'API.template.md', 'Current API fixture content.']
    ];

    for (const [file, template, marker] of documents) {
      const source = path.join(directory, 'scripts', template);

      await writeFile(source, (await readFile(source, 'utf8')) + '\n' + marker + '\n');
      await writeFile(path.join(directory, file), 'Stale generated fixture content.\n');
    }

    const result = spawnSync(process.execPath, ['scripts/' + script], { cwd: directory, encoding: 'utf8' });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    for (const [file, , marker] of documents) {
      const generated = await readFile(path.join(directory, file), 'utf8');

      assert.ok(generated.includes(marker), file + ' must reflect its current template');
      assert.ok(!generated.includes('Stale generated fixture content.'));
      assert.equal(await readFile(path.join(directory, 'package', file), 'utf8'), generated);
    }

    const check = spawnSync(process.execPath, ['scripts/docs.js', '--check'], { cwd: directory, encoding: 'utf8' });

    assert.equal(check.status, 0, check.stdout + check.stderr);
  });

  test(script + ' preserves the previous package on documentation failure and recovers after repair', async (t) => {
    const directory = await fixture(t);
    const build = () => spawnSync(process.execPath, ['scripts/' + script], { cwd: directory, encoding: 'utf8' });
    const first = build();

    assert.equal(first.status, 0, first.stdout + first.stderr);
    const previous = path.join(directory, 'previous-package');

    await cp(path.join(directory, 'package'), previous, { recursive: true });
    const template = path.join(directory, 'scripts/README.template.md');
    const source = await readFile(template, 'utf8');

    await writeFile(template, source + '\n[Broken fixture link](docs/API.md#missing-build-heading)\n');

    const failed = build();

    assert.notEqual(failed.status, 0, failed.stdout + failed.stderr);
    assert.match(failed.stderr, /Missing documentation heading: docs\/API\.md#missing-build-heading/);
    await comparePackage(previous, path.join(directory, 'package'));
    assert.ok(!(await readdir(directory)).some((file) => file.startsWith('.go-defaults-build-')));

    await writeFile(template, source + '\nRepaired README fixture content.\n');
    const repaired = build();

    assert.equal(repaired.status, 0, repaired.stdout + repaired.stderr);
    assert.match(
      await readFile(path.join(directory, 'package/README.md'), 'utf8'),
      /Repaired README fixture content\./
    );
  });
}

test('the normal build produces the same package bytes from separate staging paths', async (t) => {
  const first = await fixture(t);
  const second = await fixture(t);

  for (const directory of [first, second]) {
    const result = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: directory, encoding: 'utf8' });

    assert.equal(result.status, 0, result.stdout + result.stderr);
  }

  await comparePackage(path.join(first, 'package'), path.join(second, 'package'));
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

for (const mappings of ['', 'AAAA']) {
  test('diagnostic artifact validation rejects ' + (mappings ? 'wrong locations' : 'empty mappings'), async (t) => {
    const directory = await fixture(t);
    const built = spawnSync(process.execPath, ['scripts/build-untransformed.mjs'], {
      cwd: directory,
      encoding: 'utf8'
    });

    assert.equal(built.status, 0, built.stdout + built.stderr);
    const output = path.join(directory, 'package');
    const file = path.join(output, 'dist/defaultIf.cjs.map');
    const map = JSON.parse(await readFile(file, 'utf8'));

    map.mappings = mappings;
    await writeFile(file, JSON.stringify(map));
    await assert.rejects(checkArtifacts(output, { browser: false }), /Source map (mappings|location)/);
  });
}

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

test(
  'a Windows watcher lock preserves the previous package and rebuilding recovers after release',
  {
    skip: process.platform !== 'win32'
  },
  async (t) => {
    const directory = await fixture(t);
    const build = () =>
      spawnSync(process.execPath, ['scripts/build.mjs'], {
        cwd: directory,
        encoding: 'utf8',
        timeout: 30000
      });
    const initial = build();

    assert.equal(initial.status, 0, initial.stdout + initial.stderr);
    const output = path.join(directory, 'package');
    const previous = path.join(directory, 'previous-package');

    await writeFile(path.join(output, 'stale.txt'), 'previous output');
    await cp(output, previous, { recursive: true });
    const watcher = watch(path.join(output, 'dist'), () => {});

    try {
      const blocked = build();

      assert.notEqual(blocked.status, 0, blocked.stdout + blocked.stderr);
      assert.match(blocked.stderr, /EPERM.*rename/);
      await comparePackage(previous, output);
      assert.ok(!(await readdir(directory)).some((entry) => entry.startsWith('.go-defaults-build-')));
    } finally {
      const closed = once(watcher, 'close');

      watcher.close();
      await closed;
    }

    const recovered = build();

    assert.equal(recovered.status, 0, recovered.stdout + recovered.stderr);
    await assert.rejects(access(path.join(output, 'stale.txt')), { code: 'ENOENT' });
    await checkArtifacts(output);
    assert.ok(!(await readdir(directory)).some((entry) => entry.startsWith('.go-defaults-build-')));
  }
);
