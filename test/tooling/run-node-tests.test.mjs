import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { root } from '../../scripts/package-layout.mjs';
import { auxiliaryScripts, verificationFixture } from './fixtures/verification.mjs';

for (const script of auxiliaryScripts) {
  test(script + ' runs its current suite command independently and completes cleanup', async (t) => {
    const fixture = await verificationFixture(t);
    const result = await fixture.script(script, { NODE_TEST_CONTEXT: 'child-v8' });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.ok(result.events.some((event) => event.phase === script && event.event === 'asserted'));
    assert.ok(result.events.some((event) => event.phase === script && event.event === 'cleaned'));
    if (script === 'test:docs') {
      assert.ok(result.events.some((event) => event.phase === 'docs freshness'));
      assert.ok(result.events.some((event) => event.phase === 'docs examples'));
    }

    if (script === 'test:artifacts') assert.ok(result.events.some((event) => event.phase === 'artifact CLI'));
  });
}

for (const mode of ['assertion', 'load', 'body', 'cleanup']) {
  test('auxiliary suite rejects ' + mode + ' failure alongside passing workers', async (t) => {
    const fixture = await verificationFixture(t);

    await fs.writeFile(
      path.join(fixture.directory, 'test/tooling/second.test.mjs'),
      'import test from "node:test";test("passing peer",()=>console.log("Passing worker executed"));'
    );
    const result = await fixture.script('test:tooling', {
      ...(mode === 'assertion' ? { NODE_TEST_CONTEXT: 'child-v8' } : {}),
      WORKFLOW_TARGET: 'test:tooling',
      WORKFLOW_TEST_MODE: mode
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /Passing worker executed/);
    assert.match(
      result.stdout + result.stderr,
      mode === 'assertion' ? /Workflow assertion failure reached/ : /Runtime test execution incomplete/
    );
  });
}

test('guarded suite retains asynchronous hooks, genuine forks and explicit skips and todos', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'go-defaults-node-suite-'));

  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(path.join(directory, 'child.cjs'), 'process.exit(0);');
  await fs.writeFile(
    path.join(directory, 'suite.test.cjs'),
    String.raw`
    const {test,after}=require('node:test');const assert=require('node:assert/strict');const {fork}=require('node:child_process');
    test('ordinary fork',()=>new Promise((resolve,reject)=>{
      const child=fork('./child.cjs',{silent:true});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('fork failed')));
    }));
    test.skip('explicit skip',()=>assert.fail());test.todo('explicit todo');
    after(async()=>{await new Promise(resolve=>setTimeout(resolve,5));console.log('Asynchronous cleanup completed');});
  `
  );
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/run-node-tests.mjs'), 'suite.test.cjs'], {
    cwd: directory,
    env: { ...process.env, NODE_TEST_CONTEXT: 'child-v8' },
    encoding: 'utf8',
    timeout: 15000
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Asynchronous cleanup completed/);
  assert.match(result.stdout, /(?:ℹ|#) skipped 1/);
  assert.match(result.stdout, /(?:ℹ|#) todo 1/);
});

test('guarded suite rejects missing input and Node flags before discovery', () => {
  for (const args of [[], ['--help'], ['--test-name-pattern=missing']]) {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/run-node-tests.mjs'), ...args], {
      encoding: 'utf8'
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Usage:.*run-node-tests/);
  }
});
