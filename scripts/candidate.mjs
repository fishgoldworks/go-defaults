import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { npm } from './process.mjs';

export async function readCandidate(file, { requireSidecar = false } = {}) {
  const tarball = path.resolve(file);
  const bytes = await readFile(tarball);

  assert.ok(
    /\.tgz$/i.test(tarball) && bytes[0] === 0x1f && bytes[1] === 0x8b,
    'Expected an npm .tgz archive: ' + tarball
  );
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const sidecar = await readFile(tarball + '.sha256', 'utf8').catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    if (requireSidecar)
      throw new Error('Candidate checksum sidecar is missing: ' + tarball + '.sha256', { cause: error });
  });

  if (sidecar !== undefined) assert.equal(sidecar.trim(), sha256, 'Candidate SHA-256 does not match its sidecar');

  return { tarball, sha256 };
}

export async function assertCandidateUnchanged({ tarball, sha256 }) {
  assert.equal((await readCandidate(tarball)).sha256, sha256, 'Candidate changed during verification');
}

export async function assertCandidateOutsideBuild({ tarball }, directory) {
  const destination = path.resolve(directory);

  function assertOutside(file, parent) {
    const relative = path.relative(parent, file);

    assert.ok(
      relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative),
      'Retained candidate must be outside the generated package directory: ' +
        destination +
        '. Move it to artifacts/ or an external folder before verification.'
    );
  }

  // Check both the supplied pathname and aliases through existing directories.
  assertOutside(path.resolve(tarball), destination);
  const resolvedDestination = await realpath(destination).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });

  if (resolvedDestination !== undefined) assertOutside(await realpath(tarball), resolvedDestination);
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
  } catch (error) {
    try {
      await rm(temporary, { recursive: true, force: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Candidate verification failed and consumer cleanup also failed: ' + temporary,
        { cause: cleanupError }
      );
    }

    throw error;
  }

  await rm(temporary, { recursive: true, force: true });
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
