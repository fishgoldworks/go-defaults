import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { root } from '../../scripts/package-layout.mjs';
import { verificationFixture } from './fixtures/verification.mjs';

test('CI handoff requires the archive, its sidecar and the producer digest', async (t) => {
  const fixture = await verificationFixture(t);
  const archive = await fixture.pack();
  const sidecar = archive + '.sha256';
  const output = path.join(fixture.directory, 'github-output');
  const digest = async () =>
    createHash('sha256')
      .update(await fs.readFile(archive))
      .digest('hex');
  const expected = await digest();

  async function verify(...args) {
    await fs.writeFile(output, '');

    return fixture.execute(['scripts/check-ci-candidate.mjs', ...args], { GITHUB_OUTPUT: output });
  }

  async function reject(args, diagnostic) {
    const result = await verify(...args);

    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, diagnostic);
    assert.equal(await fs.readFile(output, 'utf8'), '');
  }

  await fs.writeFile(sidecar, expected + '\n');
  const matching = await verify(expected);

  assert.equal(matching.status, 0, matching.stdout + matching.stderr);
  assert.equal(await fs.readFile(output, 'utf8'), `archive=${archive}\nsha256=${expected}\n`);
  for (const args of [[], [''], ['not-a-digest']]) await reject(args, /Expected the producer SHA-256 digest/);

  await fs.unlink(sidecar);
  await reject([expected], /checksum sidecar is missing/);
  await fs.writeFile(sidecar, '0'.repeat(64) + '\n');
  await reject([expected], /SHA-256 does not match its sidecar/);

  await fs.appendFile(path.join(fixture.directory, 'package/README.md'), '\nSecond same-version fixture.\n');
  assert.equal(await fixture.pack(), archive);
  const alternate = await digest();

  assert.notEqual(alternate, expected);
  await fs.writeFile(sidecar, alternate + '\n');
  await reject([expected], /does not match the producer SHA-256 digest/);
});

test('the candidate outputs feed the upload and the archive check in all three downstream jobs', async () => {
  const workflow = await fs.readFile(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  const jobs = new Map(
    [...workflow.matchAll(/^ {2}([\w-]+):\r?\n((?:^(?: {4}.*)?\r?\n)*)/gm)].map(([, name, body]) => [name, body])
  );
  const producer = jobs.get('candidate');

  assert.ok(producer.includes('sha256: ${{ steps.archive.outputs.sha256 }}'));
  assert.match(producer, /id: archive\s+run: .*GO_DEFAULTS_CI_CANDIDATE_OUTPUT=.*npm run verify:all/);
  assert.match(
    producer,
    /path: \|\s+\$\{\{ steps\.archive\.outputs\.archive \}\}\s+\$\{\{ steps\.archive\.outputs\.archive \}\}\.sha256/
  );

  for (const [name, consumer] of [
    ['contributor-floor', 'npm run verify -- --tarball "$CANDIDATE_TARBALL"'],
    ['consumers', 'npm run test:runtime -- --tarball "$CANDIDATE_TARBALL"'],
    ['typescript-compatibility', '"$CANDIDATE_TARBALL"']
  ]) {
    const job = jobs.get(name);
    const check = job.indexOf('node scripts/check-ci-candidate.mjs "$EXPECTED_CANDIDATE_SHA256"');

    assert.match(
      job,
      /id: archive\s+name: [^\r\n]+\s+env:\s+EXPECTED_CANDIDATE_SHA256: \$\{\{ needs\.candidate\.outputs\.sha256 \}\}/,
      name
    );
    assert.ok(job.includes('CANDIDATE_TARBALL: ${{ steps.archive.outputs.archive }}'), name);
    assert.ok(job.indexOf('actions/download-artifact@') < check && check < job.indexOf(consumer), name);
    assert.ok(check >= 0, name);
  }
});
