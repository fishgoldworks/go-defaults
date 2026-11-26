import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { installedConsumer } from './fixtures/installed-consumer.mjs';

test('installed package checks finish under inherited worker state', async (t) => {
  const fixture = await installedConsumer(t);
  const archive = await fixture.pack();

  await fs.writeFile(
    path.join(fixture.directory, 'test/installed-passing.test.cjs'),
    'require("node:test")("installed passing control",()=>{console.log("Installed passing assertion reached");});\n'
  );
  const result = fixture.run('test-package.mjs', ['--tarball', archive], { NODE_TEST_CONTEXT: 'child-v8' });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Installed passing assertion reached/);
  assert.match(result.stdout, /Packed consumer runtime and CommonJS\/ESM declarations passed/);
  assert.deepEqual(await fixture.remainingConsumers(), []);
});

test('inherited worker state cannot skip a failing installed assertion', async (t) => {
  const fixture = await installedConsumer(t);
  const archive = await fixture.pack();

  await fs.writeFile(
    path.join(fixture.directory, 'test/installed-failure.test.cjs'),
    'require("node:test")("installed failure control",()=>{throw Error("Installed assertion reached");});\n'
  );
  const result = fixture.run('test-package.mjs', ['--tarball', archive], { NODE_TEST_CONTEXT: 'child-v8' });

  assert.notEqual(result.status, 0, 'Installed assertions must execute in an independent runner');
  assert.match(result.stdout + result.stderr, /Installed assertion reached/);
  assert.doesNotMatch(result.stdout, /Packed consumer runtime and CommonJS\/ESM declarations passed/);
  assert.deepEqual(await fixture.remainingConsumers(), []);
});

for (const phase of ['body', 'cleanup']) {
  test('installed worker zero exit during ' + phase + ' fails verification', async (t) => {
    const fixture = await installedConsumer(t);
    const archive = await fixture.pack();
    const source =
      phase === 'body'
        ? 'require("node:test")("not completed",()=>{throw Error("Unreachable assertion");});process.exit(0);\n'
        : 'const {test,after}=require("node:test");test("completed body",()=>{});after(()=>process.exit(0));\n';

    await fs.writeFile(path.join(fixture.directory, 'test/installed-exit.test.cjs'), source);
    const result = fixture.run('test-package.mjs', ['--tarball', archive]);

    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /Runtime test execution incomplete/);
    assert.deepEqual(await fixture.remainingConsumers(), []);
  });
}

for (const mode of ['exit', 'call-exit', 'throw']) {
  test('candidate ' + mode + ' stays isolated and installed cleanup completes', async (t) => {
    const fixture = await installedConsumer(t);
    const archive = await fixture.pack(mode);
    const result = fixture.run('test-package.mjs', ['--tarball', archive]);

    assert.notEqual(result.status, 0, 'An incomplete artifact child must fail its controlling verifier');
    assert.match(
      result.stdout + result.stderr,
      mode === 'throw' ? /Installed candidate failure control/ : /Consumer check execution incomplete/
    );
    assert.doesNotMatch(result.stdout, /Verified SHA-256/);
    assert.deepEqual(
      await fixture.remainingConsumers(),
      [],
      'The parent must retain installed-directory cleanup ownership'
    );
  });
}
