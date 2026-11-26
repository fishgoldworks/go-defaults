import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { verificationFixture } from './fixtures/verification.mjs';

test('verification fixtures do not inherit the parent candidate output path', async (t) => {
  const fixture = await verificationFixture(t);
  const archive = await fixture.pack();
  const parentOutput = path.join(fixture.directory, 'parent-workflow-output');
  const previousOutput = process.env.GO_DEFAULTS_CI_CANDIDATE_OUTPUT;

  t.after(() => {
    if (previousOutput === undefined) delete process.env.GO_DEFAULTS_CI_CANDIDATE_OUTPUT;
    else process.env.GO_DEFAULTS_CI_CANDIDATE_OUTPUT = previousOutput;
  });
  process.env.GO_DEFAULTS_CI_CANDIDATE_OUTPUT = parentOutput;
  await fs.writeFile(parentOutput, 'existing parent workflow output\n');

  const result = await fixture.execute(['scripts/verify.mjs', '--tarball', archive]);

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Verified release candidate:/);
  assert.equal(await fs.readFile(parentOutput, 'utf8'), 'existing parent workflow output\n');
});

test('full verification records the checked archive digest only after its consumers pass', async (t) => {
  const fixture = await verificationFixture(t);
  const output = path.join(fixture.directory, 'github-output');
  const env = { WORKFLOW_ALL: '1', GO_DEFAULTS_CI_CANDIDATE_OUTPUT: output };
  const verified = await fixture.script('verify:all', env);

  assert.equal(verified.status, 0, verified.stdout + verified.stderr);
  const consumer = verified.events.find((event) => event.phase === 'test:package');
  const archive = consumer.args[consumer.args.indexOf('--tarball') + 1];
  const sha256 = (await fs.readFile(archive + '.sha256', 'utf8')).trim();

  assert.match(sha256, /^[a-f0-9]{64}$/);
  assert.equal(await fs.readFile(output, 'utf8'), `archive=${archive}\nsha256=${sha256}\n`);
  const rejected = await fixture.execute(['scripts/verify.mjs', '--all', '--tarball', archive], {
    ...env,
    WORKFLOW_FAIL_PHASE: 'test:package'
  });

  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stdout + rejected.stderr, /Workflow leaf failure control:test:package/);
  assert.equal(await fs.readFile(output, 'utf8'), `archive=${archive}\nsha256=${sha256}\n`);
});

for (const all of [false, true]) {
  const mode = all ? 'full' : 'standard';
  const flags = all ? ['--all'] : [];

  test(mode + ' verification retains fresh/retained candidates and current phase routing', async (t) => {
    const fixture = await verificationFixture(t);
    const archive = await fixture.pack();

    for (const retained of [true, false]) {
      const result = await fixture.execute(
        ['scripts/verify.mjs', ...flags, ...(retained ? ['--tarball', archive] : [])],
        {
          WORKFLOW_ALL: all ? '1' : '0',
          NODE_TEST_CONTEXT: 'child-v8'
        }
      );

      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /Verified release candidate:/);
      assert.equal(result.events.filter((event) => event.phase === 'build').length, 1);
      assert.ok(result.events.some((event) => event.phase === 'test:tooling' && event.event === 'asserted'));
      assert.ok(result.events.some((event) => event.phase === 'test:release' && event.event === 'cleaned'));
      const consumer = result.events.find((event) => event.phase === 'test:package');

      assert.ok(consumer);
      if (retained) assert.equal(consumer.args[consumer.args.indexOf('--tarball') + 1], archive);
    }
  });

  test(mode + ' verification stops on a skipped assertion or early suite exit', async (t) => {
    const fixture = await verificationFixture(t);
    const archive = await fixture.pack();

    for (const failure of ['assertion', 'load', 'body', 'cleanup']) {
      const result = await fixture.execute(['scripts/verify.mjs', ...flags, '--tarball', archive], {
        WORKFLOW_ALL: all ? '1' : '0',
        ...(failure === 'assertion' ? { NODE_TEST_CONTEXT: 'child-v8' } : {}),
        WORKFLOW_TARGET: 'test:tooling',
        WORKFLOW_TEST_MODE: failure
      });

      assert.notEqual(result.status, 0, failure + ': ' + result.stdout + result.stderr);
      assert.match(
        result.stdout + result.stderr,
        failure === 'assertion' ? /Workflow assertion failure reached/ : /Runtime test execution incomplete/
      );
      assert.ok(!result.events.some((event) => event.phase === 'test:package'));
      assert.doesNotMatch(result.stdout, /Verified release candidate:/);
    }
  });

  test(mode + ' verification rejects absent or invalid required scripts before any phase', async (t) => {
    const fixture = await verificationFixture(t);
    const file = path.join(fixture.directory, 'package.json');

    for (const name of ['lint', 'test:types', 'test:package']) {
      for (const value of [undefined, ' ', 7]) {
        const metadata = JSON.parse(JSON.stringify(fixture.metadata));

        if (value === undefined) delete metadata.scripts[name];
        else metadata.scripts[name] = value;
        await fs.writeFile(file, JSON.stringify(metadata));
        const result = await fixture.execute(['scripts/verify.mjs', ...flags], { npm_config_if_present: 'true' });

        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /Required verification script/);
        assert.ok(result.stderr.includes(name));
        assert.deepEqual(result.events, []);
        await assert.rejects(fs.access(path.join(fixture.directory, 'artifacts')));
      }
    }
  });

  test(mode + ' verification rejects a required script removed after preflight', async (t) => {
    const fixture = await verificationFixture(t);
    const archive = await fixture.pack();

    for (const script of ['test:types', 'test:package']) {
      await fs.writeFile(path.join(fixture.directory, 'package.json'), JSON.stringify(fixture.metadata));
      const result = await fixture.execute(['scripts/verify.mjs', ...flags, '--tarball', archive], {
        WORKFLOW_ALL: all ? '1' : '0',
        WORKFLOW_DELETE_AT: 'build',
        WORKFLOW_DELETE_SCRIPT: script,
        npm_config_if_present: 'true'
      });

      assert.notEqual(result.status, 0);
      assert.ok((result.stdout + result.stderr).includes('Missing script: "' + script + '"'));
      assert.ok(!result.events.some((event) => event.phase === 'test:package'));
    }
  });
}
