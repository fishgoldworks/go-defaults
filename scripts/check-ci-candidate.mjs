import assert from 'node:assert/strict';
import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readCandidate } from './candidate.mjs';

export async function writeVerifiedCandidateOutputs(archive, expectedSha256, output) {
  assert.ok(
    typeof expectedSha256 === 'string' && /^[a-f0-9]{64}$/.test(expectedSha256),
    'Expected the producer SHA-256 digest'
  );
  assert.ok(output, 'Expected a GitHub Actions output file');
  const { tarball, sha256 } = await readCandidate(archive, { requireSidecar: true });

  assert.equal(sha256, expectedSha256, 'Candidate does not match the producer SHA-256 digest');
  assert.doesNotMatch(tarball, /[\r\n]/, 'Candidate path must fit on one GitHub Actions output line');
  await appendFile(output, `archive=${tarball}\nsha256=${sha256}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { name, version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const archive = path.join('artifacts', `${name}-${version}.tgz`);

  await writeVerifiedCandidateOutputs(archive, process.argv[2], process.env.GITHUB_OUTPUT);
}
