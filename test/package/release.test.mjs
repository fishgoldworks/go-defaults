import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { root, packageRoot } from '../../scripts/package-layout.mjs';
import { npm } from '../../scripts/process.mjs';
import { comparePackage } from '../../scripts/candidate.mjs';

async function temporary(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'go-defaults-recovery-'));

  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  return directory;
}

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

async function packingFixture(t, previous = true) {
  const directory = await temporary(t);
  const destination = path.join(directory, 'artifacts');

  await fs.cp(path.join(root, 'scripts'), path.join(directory, 'scripts'), { recursive: true });
  for (const entry of ['src', 'package.json'])
    await fs.cp(path.join(root, entry), path.join(directory, entry), { recursive: true });
  const output = path.join(directory, 'package');

  await fs.cp(packageRoot, output, { recursive: true });
  await fs.mkdir(destination);
  const metadata = JSON.parse(await fs.readFile(path.join(output, 'package.json'), 'utf8'));
  const tarball = path.join(destination, metadata.name + '-' + metadata.version + '.tgz');
  let original;

  if (previous) {
    await fs.writeFile(path.join(output, 'README.md'), 'Previous candidate.\n');
    npm(['pack', '--ignore-scripts', '--dry-run=false', '--json', '--pack-destination', destination], output);
    const bytes = await fs.readFile(tarball);
    const checksum = createHash('sha256').update(bytes).digest('hex') + '\n';

    await fs.writeFile(tarball + '.sha256', checksum);
    await fs.writeFile(path.join(destination, 'notes.txt'), 'Keep local notes.\n');
    original = { bytes, checksum };
  }

  await fs.writeFile(path.join(output, 'README.md'), 'Current candidate.\n');
  function run(program, mode = '', dryRun = false) {
    const environment = { ...process.env };

    for (const key of Object.keys(environment)) if (key.toLowerCase() === 'npm_config_dry_run') delete environment[key];
    environment.npm_config_dry_run = String(dryRun);

    return spawnSync(process.execPath, ['--input-type=module', '-e', program, destination, mode, tarball], {
      cwd: directory,
      env: environment,
      encoding: 'utf8'
    });
  }

  async function assertPreserved() {
    if (original) {
      assert.ok((await fs.readFile(tarball)).equals(original.bytes), 'Previous archive must survive packing failure');
      assert.equal(await fs.readFile(tarball + '.sha256', 'utf8'), original.checksum);
      assert.equal(await fs.readFile(path.join(destination, 'notes.txt'), 'utf8'), 'Keep local notes.\n');
      assert.deepEqual(
        (await fs.readdir(destination)).sort(),
        [path.basename(tarball), path.basename(tarball) + '.sha256', 'notes.txt'].sort()
      );
    } else {
      assert.deepEqual(await fs.readdir(destination), [], 'A failed first pack must leave no partial candidate');
    }
  }

  return { directory, destination, tarball, run, assertPreserved };
}

const packProgram = 'import { packPackage } from "./scripts/pack-package.mjs"; await packPackage(process.argv[1]);';

const corruptArchiveProgram = String.raw`
  import assert from 'node:assert/strict';
  import fs from 'node:fs';
  import path from 'node:path';
  import child from 'node:child_process';
  import { gzipSync, gunzipSync } from 'node:zlib';
  import { syncBuiltinESMExports } from 'node:module';
  const [destination, mode] = process.argv.slice(1);
  const execute = child.execFileSync;
  child.execFileSync = (command, args, options) => {
    const output = execute(command, args, options);
    if (!args.includes('pack')) return output;
    const reports = JSON.parse(output);
    const file = path.join(args[args.indexOf('--pack-destination') + 1], reports[0].filename);
    const bytes = fs.readFileSync(file);
    let replacement;
    if (mode === 'gzip-header') replacement = Buffer.from([0x1f, 0x8b]);
    else if (mode === 'gzip-truncated') replacement = bytes.subarray(0, bytes.length - 8);
    else if (mode === 'gzip-corrupt') {
      replacement = Buffer.from(bytes);
      replacement[replacement.length - 8] ^= 255;
    } else if (mode === 'gzip-not-tar') replacement = gzipSync('This is not a tar archive.');
    else if (mode === 'report-inventory') reports[0].files = reports[0].files.filter((entry) => entry.path !== 'README.md');
    else {
      const tar = gunzipSync(bytes);
      if (mode === 'tar-checksum') tar[0] ^= 1;
      else if (mode === 'tar-truncated') replacement = gzipSync(tar.subarray(0, 512));
      else if (mode === 'tar-path-padding') {
        const name = 'package/README.md';
        const offset = tar.indexOf(Buffer.from(name + '\0'));
        assert.ok(offset >= 0 && offset % 512 === 0);
        tar.write('\nx', offset + name.length + 1);
        tar.fill(32, offset + 148, offset + 156);
        const checksum = tar.subarray(offset, offset + 512).reduce((sum, byte) => sum + byte, 0);
        tar.write(checksum.toString(8).padStart(6, '0') + ' \0', offset + 148);
      }
      else {
        const [before, after] = mode === 'package-identity'
          ? ['"name": "go-defaults"', '"name": "no-defaults"']
          : ['Current candidate.\n', 'Altered candidate.\n'];
        const offset = tar.indexOf(Buffer.from(before));
        assert.ok(offset >= 0, 'Controlled fixture content must exist');
        assert.equal(Buffer.byteLength(before), Buffer.byteLength(after));
        tar.write(after, offset);
      }
      replacement ??= gzipSync(tar);
    }
    if (replacement) fs.writeFileSync(file, replacement);
    return JSON.stringify(reports);
  };
  syncBuiltinESMExports();
  const { packPackage } = await import('./scripts/pack-package.mjs');
  await assert.rejects(packPackage(destination), /Packed archive/);
`;

for (const mode of [
  'gzip-header',
  'gzip-truncated',
  'gzip-corrupt',
  'gzip-not-tar',
  'tar-checksum',
  'tar-truncated',
  'tar-path-padding',
  'package-identity',
  'report-inventory',
  'payload-drift'
]) {
  test('packing rejects ' + mode + ' before replacing the previous pair', async (t) => {
    const fixture = await packingFixture(t);
    const result = fixture.run(corruptArchiveProgram, mode);

    assert.equal(result.status, 0, result.error?.message || result.stderr);
    await fixture.assertPreserved();
  });
}

for (const mode of ['rollback', 'committed']) {
  test('pack CLI reports nested errors and ' + mode + ' state', async (t) => {
    const fixture = await packingFixture(t);

    await fs.writeFile(path.join(fixture.directory, 'scripts/build.mjs'), 'export async function buildPackage() {}\n');
    const hook = path.join(fixture.directory, 'cli-fault.mjs');
    const program = String.raw`
      import fs from 'node:fs/promises';
      import path from 'node:path';
      import { syncBuiltinESMExports } from 'node:module';
      const mode = ${JSON.stringify(mode)};
      const tarball = path.resolve('artifacts', ${JSON.stringify(path.basename(fixture.tarball))});
      const rename = fs.rename;
      let failed = false;
      if (mode === 'rollback') {
        fs.rename = async (source, target) => {
          if (target === tarball + '.sha256' && !failed) {
            failed = true;
            throw new Error('CLI replacement failure');
          }
          if (failed && target === tarball) throw new Error('CLI rollback failure');
          return rename(source, target);
        };
      } else {
        fs.rm = async () => { throw new Error('CLI cleanup failure', { cause: new Error('CLI nested cause') }); };
      }
      syncBuiltinESMExports();
    `;

    await fs.writeFile(hook, program);
    const result = spawnSync(process.execPath, ['--import', pathToFileURL(hook).href, 'scripts/pack-package.mjs'], {
      cwd: fixture.directory,
      encoding: 'utf8'
    });

    assert.notEqual(result.status, 0);
    if (mode === 'rollback') {
      assert.match(result.stderr, /CLI replacement failure/);
      assert.match(result.stderr, /CLI rollback failure/);
      assert.match(result.stderr, /recoveryDirectory:/);
    } else {
      assert.match(result.stderr, /CLI cleanup failure/);
      assert.match(result.stderr, /CLI nested cause/);
      assert.match(result.stderr, /committed: true/);
      assert.ok(result.stderr.includes(fixture.tarball));
    }
  });
}

test('verify CLI preserves combined errors, causes and structured recovery fields', async (t) => {
  const fixture = await packingFixture(t);

  await fs.writeFile(
    path.join(fixture.directory, 'scripts/process.mjs'),
    String.raw`
    export function npm() {
      const failure = new AggregateError([
        new Error('CLI verification failure'),
        new Error('CLI consumer cleanup failure', { cause: new Error('CLI nested cause') })
      ], 'CLI combined failure', { cause: new Error('CLI outer cause') });
      failure.committed = true;
      failure.recoveryDirectory = 'retained-recovery';
      failure.tarball = 'retained-candidate.tgz';
      throw failure;
    }
  `
  );
  for (const flags of [[], ['--all']]) {
    const result = spawnSync(process.execPath, ['scripts/verify.mjs', ...flags], {
      cwd: fixture.directory,
      encoding: 'utf8'
    });

    assert.notEqual(result.status, 0);
    for (const message of [
      'CLI verification failure',
      'CLI consumer cleanup failure',
      'CLI nested cause',
      'CLI outer cause',
      'committed: true',
      'retained-recovery',
      'retained-candidate.tgz'
    ]) {
      assert.ok(result.stderr.includes(message), message + '\n' + result.stderr);
    }
  }
});

for (const [previous, dryRun] of [
  [true, false],
  [true, true],
  [false, true]
]) {
  test('packing writes a fresh matching pair: previous=' + previous + ', inherited dry-run=' + dryRun, async (t) => {
    const fixture = await packingFixture(t, previous);
    const result = fixture.run(packProgram, '', dryRun);

    assert.equal(result.status, 0, result.error?.message || result.stderr);
    const summary = JSON.parse(result.stdout);

    assert.equal(summary.tarball, fixture.tarball);
    const digest = createHash('sha256')
      .update(await fs.readFile(fixture.tarball))
      .digest('hex');

    assert.equal(summary.sha256, digest);
    assert.equal(await fs.readFile(fixture.tarball + '.sha256', 'utf8'), digest + '\n');
    const consumer = path.join(fixture.directory, 'consumer');

    await fs.mkdir(consumer);
    await fs.writeFile(path.join(consumer, 'package.json'), JSON.stringify({ private: true }));
    npm(
      ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', fixture.tarball],
      consumer
    );
    assert.equal(
      await fs.readFile(path.join(consumer, 'node_modules/go-defaults/README.md'), 'utf8'),
      'Current candidate.\n'
    );
    assert.deepEqual(
      (await fs.readdir(fixture.destination)).sort(),
      [
        path.basename(fixture.tarball),
        path.basename(fixture.tarball) + '.sha256',
        ...(previous ? ['notes.txt'] : [])
      ].sort()
    );
  });
}

const packingFaultProgram = String.raw`
  import assert from 'node:assert/strict';
  import fs from 'node:fs/promises';
  import path from 'node:path';
  import { syncBuiltinESMExports } from 'node:module';
  const [destination, mode, tarball] = process.argv.slice(1);
  const checksum = tarball + '.sha256';
  const primary = mode === 'replace-undefined' ? undefined : new Error('packing denied');
  const rollback = new Error('rollback denied');
  const cleanup = new Error('cleanup denied');
  const write = fs.writeFile;
  const rename = fs.rename;
  let replacementFailed = false;
  fs.writeFile = async (file, ...args) => {
    if (mode.startsWith('checksum') && String(file).endsWith('.sha256')) throw primary;
    return write(file, ...args);
  };
  fs.rename = async (source, target) => {
    if (mode === 'backup' && source === checksum) throw primary;
    if ((mode.startsWith('replace') || mode === 'rollback') && target === checksum && !replacementFailed) {
      replacementFailed = true;
      throw primary;
    }
    if (mode === 'rollback' && replacementFailed && target === tarball) throw rollback;
    return rename(source, target);
  };
  if (mode.endsWith('cleanup')) fs.rm = async () => { throw cleanup; };
  syncBuiltinESMExports();
  const { packPackage } = await import('./scripts/pack-package.mjs');
  let caught = false;
  try {
    await packPackage(destination);
  } catch (error) {
    caught = true;
    if (mode === 'rollback') {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [primary, rollback]);
      assert.equal(path.dirname(error.recoveryDirectory), destination);
      assert.ok(error.message.includes(error.recoveryDirectory));
      console.log(JSON.stringify({ recoveryDirectory: error.recoveryDirectory }));
    } else if (mode === 'checksum-cleanup') {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [primary, cleanup]);
    } else if (mode === 'success-cleanup') {
      assert.equal(error.cause, cleanup);
      assert.equal(error.committed, true);
      assert.equal(error.tarball, tarball);
      assert.ok(error.message.includes(tarball));
    } else {
      assert.strictEqual(error, primary);
    }
  }
  assert.ok(caught, 'The injected packing failure must propagate');
`;

for (const previous of [true, false]) {
  test('packing preserves the destination on checksum failure: previous=' + previous, async (t) => {
    const fixture = await packingFixture(t, previous);
    const result = fixture.run(packingFaultProgram, 'checksum');

    assert.equal(result.status, 0, result.error?.message || result.stderr);
    await fixture.assertPreserved();
  });
}

for (const mode of ['backup', 'replace', 'replace-undefined']) {
  test('packing restores the previous pair on ' + mode + ' failure', async (t) => {
    const fixture = await packingFixture(t);
    const result = fixture.run(packingFaultProgram, mode);

    assert.equal(result.status, 0, result.error?.message || result.stderr);
    await fixture.assertPreserved();
  });
}

test('packing retains recovery files when rollback fails', async (t) => {
  const fixture = await packingFixture(t);
  const previous = await fs.readFile(fixture.tarball);
  const result = fixture.run(packingFaultProgram, 'rollback');

  assert.equal(result.status, 0, result.error?.message || result.stderr);
  const { recoveryDirectory } = JSON.parse(result.stdout);

  assert.ok(
    (await fs.readFile(path.join(recoveryDirectory, 'previous', path.basename(fixture.tarball)))).equals(previous)
  );
  const checksum = createHash('sha256').update(previous).digest('hex') + '\n';

  assert.equal(await fs.readFile(fixture.tarball + '.sha256', 'utf8'), checksum);
});

test('packing preserves the original error when staging cleanup also fails', async (t) => {
  const fixture = await packingFixture(t);
  const previous = await fs.readFile(fixture.tarball);
  const checksum = await fs.readFile(fixture.tarball + '.sha256');
  const result = fixture.run(packingFaultProgram, 'checksum-cleanup');

  assert.equal(result.status, 0, result.error?.message || result.stderr);
  assert.ok((await fs.readFile(fixture.tarball)).equals(previous));
  assert.deepEqual(await fs.readFile(fixture.tarball + '.sha256'), checksum);
});

test('packing reports the installed new pair when successful-pack cleanup fails', async (t) => {
  const fixture = await packingFixture(t);
  const previous = await fs.readFile(fixture.tarball);
  const result = fixture.run(packingFaultProgram, 'success-cleanup');

  assert.equal(result.status, 0, result.error?.message || result.stderr);
  const current = await fs.readFile(fixture.tarball);

  assert.ok(!current.equals(previous));
  assert.equal(
    await fs.readFile(fixture.tarball + '.sha256', 'utf8'),
    createHash('sha256').update(current).digest('hex') + '\n'
  );
});

test('both verification modes reject a missing, invalid or digest-mismatched candidate before building', async (t) => {
  const directory = await temporary(t);
  const missing = path.join(directory, 'missing.tgz');
  const invalid = path.join(directory, 'invalid.tgz');
  const mismatched = path.join(directory, 'mismatched.tgz');

  await fs.writeFile(invalid, 'not an npm archive');
  await fs.writeFile(mismatched, Buffer.from([0x1f, 0x8b]));
  await fs.writeFile(mismatched + '.sha256', '0'.repeat(64) + '\n');

  for (const flags of [[], ['--all']]) {
    for (const [archive, message] of [
      [missing, /ENOENT/],
      [invalid, /Expected an npm .tgz archive/],
      [mismatched, /Candidate SHA-256 does not match its sidecar/]
    ]) {
      const result = spawnSync(process.execPath, ['scripts/verify.mjs', ...flags, '--tarball', archive], {
        cwd: root,
        encoding: 'utf8'
      });

      assert.equal(result.status, 1, result.error?.message || result.stderr);
      assert.match(result.stderr, message);
      assert.equal(result.stdout, '');
    }
  }
});

async function candidateLocationFixture(t) {
  const directory = await temporary(t);
  const checkout = path.join(directory, 'checkout');

  await fs.mkdir(checkout);
  for (const entry of ['src', 'scripts', 'package.json'])
    await fs.cp(path.join(root, entry), path.join(checkout, entry), { recursive: true });
  // Stop at the first external command so a failing guard cannot rebuild or delete test inputs.
  await fs.writeFile(
    path.join(checkout, 'scripts/process.mjs'),
    "export function npm(args) { throw new Error('Verification command reached: ' + args.join(' ')); }\n"
  );
  const [packed] = JSON.parse(
    npm(['pack', '--ignore-scripts', '--json', '--pack-destination', directory], packageRoot)
  );
  const bytes = await fs.readFile(path.join(directory, packed.filename));
  const checksum = createHash('sha256').update(bytes).digest('hex') + '\n';

  async function place(file) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes);
    await fs.writeFile(file + '.sha256', checksum);

    return file;
  }

  async function verify(file, flags, allowed) {
    const result = spawnSync(process.execPath, ['scripts/verify.mjs', ...flags, '--tarball', file], {
      cwd: checkout,
      encoding: 'utf8'
    });

    assert.equal(result.status, 1, result.error?.message || result.stderr);
    assert.match(
      result.stderr,
      allowed
        ? /Verification command reached: run lint/
        : /Retained candidate must be outside the generated package directory/,
      file + ' ' + flags.join(' ')
    );
    assert.equal(result.stdout, '');
    assert.deepEqual(await fs.readFile(file), bytes, 'Retained archive must survive validation');
    assert.equal(await fs.readFile(file + '.sha256', 'utf8'), checksum, 'Checksum must survive validation');
  }

  return { directory, checkout, place, verify };
}

test('both verification modes preserve and reject retained archives inside package or its aliases', async (t) => {
  const { directory, checkout, place, verify } = await candidateLocationFixture(t);
  const output = path.join(checkout, 'package');
  const direct = await place(path.join(output, 'candidate.tgz'));
  const nested = await place(path.join(output, 'nested/candidate.tgz'));
  const alias = path.join(directory, 'package-alias');

  await fs.symlink(output, alias, 'junction');
  const outside = await place(path.join(directory, 'external/candidate.tgz'));
  const insideAlias = path.join(output, 'external-alias');

  await fs.symlink(path.dirname(outside), insideAlias, 'junction');
  const candidates = [direct, nested, path.join(alias, 'candidate.tgz'), path.join(insideAlias, 'candidate.tgz')];

  for (const flags of [[], ['--all']]) {
    for (const candidate of candidates) await verify(candidate, flags, false);
    await verify(outside, flags, true);
  }
});

test('retained verification resolves the build directory and allows safe outside locations', async (t) => {
  const { directory, checkout, place, verify } = await candidateLocationFixture(t);
  const outside = await place(path.join(checkout, 'artifacts/candidate.tgz'));
  const sibling = await place(path.join(checkout, 'package-old/candidate.tgz'));

  for (const flags of [[], ['--all']]) {
    // A retained candidate can be checked from a fresh checkout without package/ yet.
    await verify(outside, flags, true);
    await verify(sibling, flags, true);
  }

  const output = path.join(directory, 'physical-output');
  const inside = await place(path.join(output, 'candidate.tgz'));

  await fs.symlink(output, path.join(checkout, 'package'), 'junction');
  const outsideAlias = path.join(directory, 'artifacts-alias');

  await fs.symlink(path.dirname(outside), outsideAlias, 'junction');
  for (const flags of [[], ['--all']]) {
    await verify(inside, flags, false);
    await verify(outside, flags, true);
    await verify(path.join(outsideAlias, 'candidate.tgz'), flags, true);
  }
});

test('candidate comparison rejects payload or inventory drift', async (t) => {
  const directory = await temporary(t);
  const build = path.join(directory, 'build');
  const installed = path.join(directory, 'installed');

  for (const target of [build, installed]) {
    await fs.mkdir(target);
    await fs.writeFile(path.join(target, 'README.md'), 'verified');
  }

  await comparePackage(installed, build);
  await fs.writeFile(path.join(installed, 'README.md'), 'stale');
  await assert.rejects(comparePackage(installed, build), /Candidate file differs.*README\.md/);
  await fs.writeFile(path.join(installed, 'unexpected.js'), 'extra');
  await assert.rejects(comparePackage(installed, build), /Candidate inventory differs/);
});

test('candidate cleanup preserves verification failures and reports combined failures', async (t) => {
  const directory = await temporary(t);
  const [packed] = JSON.parse(
    npm(['pack', '--ignore-scripts', '--json', '--pack-destination', directory], packageRoot)
  );
  const archive = path.join(directory, packed.filename);
  const program = String.raw`
    import assert from 'node:assert/strict';
    import fs from 'node:fs/promises';
    import os from 'node:os';
    import path from 'node:path';
    import { syncBuiltinESMExports } from 'node:module';

    const [archive, verification, cleanup] = process.argv.slice(1);
    const original = new Error('verification failed');
    const cleanupError = new Error('consumer cleanup failed');
    const failures = new Map([['error', original], ['null', null], ['undefined', undefined]]);
    const verificationFails = failures.has(verification);
    const cleanupFails = cleanup === 'fail';
    const remove = fs.rm;
    let temporary;
    let checked = false;
    let caught = false;

    fs.rm = async (directory, options) => {
      temporary ??= directory;
      assert.equal(directory, temporary);
      if (cleanupFails) throw cleanupError;
      await remove(directory, options);
    };
    syncBuiltinESMExports();

    try {
      const { readCandidate, withInstalledCandidate } = await import('./scripts/candidate.mjs');
      const candidate = await readCandidate(archive);

      try {
        await withInstalledCandidate(candidate, async (directory, installed) => {
          temporary = directory;
          assert.equal(installed, path.join(directory, 'node_modules/go-defaults'));
          await fs.access(path.join(installed, 'package.json'));
          checked = true;
          if (verificationFails) throw failures.get(verification);
        });
      } catch (error) {
        caught = true;
        if (verificationFails && cleanupFails) {
          assert.ok(error instanceof AggregateError);
          assert.deepEqual(error.errors, [failures.get(verification), cleanupError]);
          assert.strictEqual(error.cause, cleanupError);
          assert.ok(error.message.includes(temporary));
        } else if (verificationFails) {
          assert.strictEqual(error, failures.get(verification));
        } else {
          assert.strictEqual(error, cleanupError);
        }
      }

      assert.equal(checked, true);
      assert.equal(caught, verificationFails || cleanupFails);
      if (cleanupFails) await fs.access(temporary);
      else await assert.rejects(fs.access(temporary), { code: 'ENOENT' });
    } finally {
      fs.rm = remove;
      syncBuiltinESMExports();
      if (temporary !== undefined) {
        assert.equal(path.dirname(temporary), os.tmpdir());
        assert.ok(path.basename(temporary).startsWith('go-defaults-consumer-'));
        await remove(temporary, { recursive: true, force: true });
      }
    }
  `;

  for (const verification of ['success', 'error', 'null', 'undefined']) {
    for (const cleanup of ['success', 'fail']) {
      const result = spawnSync(
        process.execPath,
        ['--input-type=module', '-e', program, archive, verification, cleanup],
        { cwd: root, encoding: 'utf8' }
      );

      assert.equal(result.status, 0, verification + '/' + cleanup + '\n' + result.stdout + result.stderr);
    }
  }
});
