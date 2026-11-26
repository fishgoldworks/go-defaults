import path from 'node:path';
import { parseArgs } from 'node:util';
import { root, packageRoot, metadata } from './package-layout.mjs';
import { npm } from './process.mjs';
import { packPackage } from './pack-package.mjs';
import { readCandidate, assertCandidateUnchanged, assertCandidateOutsideBuild } from './candidate.mjs';
import { writeVerifiedCandidateOutputs } from './check-ci-candidate.mjs';

const { values } = parseArgs({ options: { all: { type: 'boolean' }, tarball: { type: 'string' } } });
const supplied = values.tarball !== undefined ? await readCandidate(values.tarball) : undefined;

if (supplied !== undefined) await assertCandidateOutsideBuild(supplied, packageRoot);
const commonScripts = [
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
];
const consumerScript = 'test:package';
const configured = metadata.scripts ?? {};

for (const script of [...commonScripts, consumerScript]) {
  if (!Object.hasOwn(configured, script) || typeof configured[script] !== 'string' || !configured[script].trim())
    throw new Error('Required verification script is missing or invalid: ' + script);
}

for (const script of commonScripts) {
  process.stdout.write(npm(['run', script, '--if-present=false'], root));
}

const candidate = supplied ?? (await packPackage(path.join(root, 'artifacts')));

await assertCandidateUnchanged(candidate);
process.stdout.write(
  npm(
    [
      'run',
      consumerScript,
      '--if-present=false',
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
const ciOutput = process.env.GO_DEFAULTS_CI_CANDIDATE_OUTPUT;

if (ciOutput === undefined) await assertCandidateUnchanged(candidate);
else await writeVerifiedCandidateOutputs(candidate.tarball, candidate.sha256, ciOutput);
console.log('Verified release candidate: ' + candidate.tarball + '\nSHA-256: ' + candidate.sha256);
