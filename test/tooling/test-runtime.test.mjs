import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { installedConsumer } from './fixtures/installed-consumer.mjs';

test('selected runtime completes CommonJS and native ESM consumers', async (t) => {
  const fixture = await installedConsumer(t);
  const archive = await fixture.pack();
  const result = fixture.run('test-runtime.js', ['--tarball', archive, '--node', process.execPath]);

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /CommonJS defaults imports/);
  assert.match(result.stdout, /Native ESM defaults imports/);
  assert.deepEqual(await fixture.remainingConsumers(), []);
});

for (const mode of ['cjs', 'mjs']) {
  test('selected ' + mode + ' consumer cannot exit before its assertions complete', async (t) => {
    const fixture = await installedConsumer(t);
    const archive = await fixture.pack();
    const file = path.join(fixture.directory, 'test/package/consumer.' + mode);

    await fs.writeFile(file, 'process.exit(0);\n' + (await fs.readFile(file, 'utf8')));
    const result = fixture.run('test-runtime.js', ['--tarball', archive, '--node', process.execPath]);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /Consumer check execution incomplete/);
    assert.deepEqual(await fixture.remainingConsumers(), []);
  });
}

test('native ESM must finish its asynchronous assertion chain before completion', async (t) => {
  const fixture = await installedConsumer(t);
  const archive = await fixture.pack();
  const file = path.join(fixture.directory, 'test/package/consumer.mjs');
  const source = await fs.readFile(file, 'utf8');
  const pending = source.replace('.then(async () => {', '.then(async () => { await new Promise(() => {});');

  assert.notEqual(pending, source);
  await fs.writeFile(file, pending);
  const result = fixture.run('test-runtime.js', ['--tarball', archive, '--node', process.execPath]);

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Consumer check execution incomplete: mjs/);
  assert.deepEqual(await fixture.remainingConsumers(), []);
});

for (const kind of ['wrong-kind', 'stale-token', 'wrong-runtime', 'malformed']) {
  test('consumer completion rejects ' + kind + ' records', async (t) => {
    const fixture = await installedConsumer(t);
    const archive = await fixture.pack();
    const source = `const fs=require('fs');const file=process.env.GO_DEFAULTS_CONSUMER_COMPLETION_FILE;if(file){const record={token:process.env.GO_DEFAULTS_CONSUMER_COMPLETION_TOKEN,kind:'cjs',node:process.version};if(${JSON.stringify(kind)}==='wrong-kind')record.kind='mjs';if(${JSON.stringify(kind)}==='stale-token')record.token='previous-invocation';if(${JSON.stringify(kind)}==='wrong-runtime')record.node='v0.0.0';fs.writeFileSync(file,${JSON.stringify(kind)}==='malformed'?'not JSON':JSON.stringify(record));}`;

    await fs.writeFile(path.join(fixture.directory, 'test/package/consumer.cjs'), source);
    const result = fixture.run('test-runtime.js', ['--tarball', archive, '--node', process.execPath]);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /Consumer check execution incomplete/);
    assert.deepEqual(await fixture.remainingConsumers(), []);
  });
}
