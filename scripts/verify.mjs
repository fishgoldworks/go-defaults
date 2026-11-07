import path from 'node:path';
import { parseArgs } from 'node:util';
import { root, packageRoot } from './package-layout.mjs';
import { npm } from './process.mjs';
import { packPackage } from './pack-package.mjs';
import { readCandidate, assertCandidateUnchanged } from './candidate.mjs';

const { values } = parseArgs({ options: { all: { type: 'boolean' }, tarball: { type: 'string' } } });
const supplied = values.tarball !== undefined ? await readCandidate(values.tarball) : undefined;
for (const script of [
  'lint',
  'format:check',
  'build',
  'test:docs',
  'coverage',
  'test:types',
  'test:build',
  'test:tooling',
  'test:artifacts',
  'test:release'
]) {
  process.stdout.write(npm(['run', script], root));
}
const candidate = supplied ?? (await packPackage(path.join(root, 'artifacts')));
await assertCandidateUnchanged(candidate);
process.stdout.write(
  npm(
    [
      'run',
      'test:package',
      '--',
      '--tarball',
      candidate.tarball,
      '--compare-package',
      packageRoot,
      ...(values.all ? ['--browser'] : [])
    ],
    root
  )
);
await assertCandidateUnchanged(candidate);
console.log('Verified release candidate: ' + candidate.tarball + '\nSHA-256: ' + candidate.sha256);
