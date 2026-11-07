import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { root } from '../../scripts/package-layout.mjs';
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
