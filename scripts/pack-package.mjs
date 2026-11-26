import { lstat, mkdir, mkdtemp, rename, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, packageRoot } from './package-layout.mjs';
import { npm } from './process.mjs';
import { readCandidate } from './candidate.mjs';
import { checkPackedArchive } from './check-packed-archive.mjs';

export async function packPackage(directory = path.join(root, 'artifacts')) {
  directory = path.resolve(directory);
  await mkdir(directory, { recursive: true });
  const stage = await mkdtemp(path.join(directory, '.pack-'));
  const output = path.join(stage, 'output');
  const previous = path.join(stage, 'previous');
  const saved = [];
  const installed = [];
  let retainRecovery = false;
  let failed = false;
  let failure;
  let candidate;

  try {
    await mkdir(output);
    await mkdir(previous);
    const packed = JSON.parse(
      npm(['pack', '--ignore-scripts', '--dry-run=false', '--json', '--pack-destination', output], packageRoot)
    );
    const filename = Array.isArray(packed) && packed.length === 1 ? packed[0]?.filename : undefined;

    if (
      typeof filename !== 'string' ||
      !filename.endsWith('.tgz') ||
      path.posix.basename(filename) !== filename ||
      path.win32.basename(filename) !== filename
    )
      throw new Error('npm pack must report exactly one archive filename');
    const staged = path.join(output, filename);

    if (!(await lstat(staged)).isFile()) throw new Error('Packed archive must be a regular file: ' + staged);
    await checkPackedArchive(staged, packed[0], packageRoot);
    const { sha256 } = await readCandidate(staged);

    await writeFile(staged + '.sha256', sha256 + '\n');

    // Prepare both files before moving the last candidate. Two-file replacement
    // is not atomic, so back up and restore the pair on ordinary failures.
    const names = [filename, filename + '.sha256'];

    for (const name of names) {
      const target = path.join(directory, name);
      const stat = await lstat(target).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });

      if (stat) {
        if (!stat.isFile()) throw new Error('Candidate target must be a regular file: ' + target);
        await rename(target, path.join(previous, name));
        saved.push(name);
      }
    }

    for (const name of names) {
      await rename(path.join(output, name), path.join(directory, name));
      installed.push(name);
    }

    candidate = { tarball: path.join(directory, filename), sha256 };
  } catch (error) {
    failed = true;
    failure = error;
    const recoveryErrors = [];

    for (const name of installed.reverse()) {
      try {
        await unlink(path.join(directory, name));
      } catch (recoveryError) {
        recoveryErrors.push(recoveryError);
      }
    }

    for (const name of saved.reverse()) {
      try {
        await rename(path.join(previous, name), path.join(directory, name));
      } catch (recoveryError) {
        recoveryErrors.push(recoveryError);
      }
    }

    if (recoveryErrors.length) {
      retainRecovery = true;
      failure = new AggregateError(
        [error, ...recoveryErrors],
        'Packing rollback failed; recovery files retained at ' + stage
      );
      failure.recoveryDirectory = stage;
    }
  }

  if (!retainRecovery) {
    try {
      await rm(stage, { recursive: true, force: true });
    } catch (cleanupError) {
      if (failed) {
        failure = new AggregateError(
          [failure, cleanupError],
          'Packing failed and staging cleanup also failed at ' + stage
        );
      } else {
        failure = new Error('Candidate installed at ' + candidate.tarball + '; staging cleanup failed at ' + stage, {
          cause: cleanupError
        });
        failure.committed = true;
        failure.tarball = candidate.tarball;
      }

      failed = true;
    }
  }

  if (failed) throw failure;
  console.log(JSON.stringify(candidate));

  return candidate;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length > 2) throw new Error('Usage: npm run pack:package');
  const { buildPackage } = await import('./build.mjs');

  await buildPackage();
  await packPackage();
}
