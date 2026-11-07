import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { npm } from './process.mjs';

export async function readCandidate(file) {
  const tarball = path.resolve(file);
  const bytes = await readFile(tarball);
  assert.ok(
    /\.tgz$/i.test(tarball) && bytes[0] === 0x1f && bytes[1] === 0x8b,
    'Expected an npm .tgz archive: ' + tarball
  );
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const sidecar = await readFile(tarball + '.sha256', 'utf8').catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
  if (sidecar !== undefined) assert.equal(sidecar.trim(), sha256, 'Candidate SHA-256 does not match its sidecar');
  return { tarball, sha256 };
}

export async function assertCandidateUnchanged({ tarball, sha256 }) {
  assert.equal((await readCandidate(tarball)).sha256, sha256, 'Candidate changed during verification');
}

export async function withInstalledCandidate(candidate, check) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'go-defaults-consumer-'));
  try {
    await writeFile(path.join(temporary, 'package.json'), JSON.stringify({ private: true }));
    process.stdout.write(
      npm(
        [
          'install',
          '--offline',
          '--ignore-scripts',
          '--no-audit',
          '--no-fund',
          '--package-lock=false',
          candidate.tarball
        ],
        temporary
      )
    );
    await check(temporary, path.join(temporary, 'node_modules/go-defaults'));
    await assertCandidateUnchanged(candidate);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function comparePackage(installed, build) {
  async function inventory(root) {
    return (await readdir(root, { recursive: true, withFileTypes: true }))
      .filter((entry) => !entry.isDirectory())
      .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)))
      .sort();
  }
  const files = await inventory(build);
  assert.deepEqual(await inventory(installed), files, 'Candidate inventory differs from the checked build');
  for (const file of files) {
    const candidate = await readFile(path.join(installed, file));
    const expected = await readFile(path.join(build, file));
    assert.ok(candidate.equals(expected), 'Candidate file differs from the checked build: ' + file);
  }
}
