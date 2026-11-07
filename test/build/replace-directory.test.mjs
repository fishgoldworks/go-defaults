import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { replaceDirectory } from '../../scripts/replace-directory.mjs';

async function temporary(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'go-defaults-recovery-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

for (const rollbackFails of [false, true]) {
  test(
    rollbackFails
      ? 'failed rollback retains and reports the previous complete output'
      : 'replacement failure restores the previous complete output',
    async (t) => {
      const directory = await temporary(t);
      const staged = path.join(directory, 'staged');
      const destination = path.join(directory, 'package');
      await fs.mkdir(staged);
      await fs.mkdir(destination);
      await fs.writeFile(path.join(destination, 'marker'), 'previous');
      const replacementError = new Error('replacement denied');
      const rollbackError = new Error('rollback denied');
      const operations = {
        ...fs,
        rename: async (source, target) => {
          if (source === staged) throw replacementError;
          if (rollbackFails && source === staged + '-previous') throw rollbackError;
          return fs.rename(source, target);
        }
      };
      await assert.rejects(replaceDirectory(staged, destination, operations), (error) => {
        if (!rollbackFails) return error === replacementError;
        assert.deepEqual(error.errors, [replacementError, rollbackError]);
        assert.ok(error.message.includes(staged + '-previous'));
        return true;
      });
      assert.equal(
        await fs.readFile(path.join(rollbackFails ? staged + '-previous' : destination, 'marker'), 'utf8'),
        'previous'
      );
    }
  );
}

test('successful replacement commits the new directory and removes the old backup', async (t) => {
  const directory = await temporary(t);
  const staged = path.join(directory, 'staged');
  const destination = path.join(directory, 'package');
  await fs.mkdir(staged);
  await fs.mkdir(destination);
  await fs.writeFile(path.join(staged, 'candidate'), 'new');
  await fs.writeFile(path.join(destination, 'previous'), 'old');
  await replaceDirectory(staged, destination);
  assert.equal(await fs.readFile(path.join(destination, 'candidate'), 'utf8'), 'new');
  await assert.rejects(fs.access(staged + '-previous'), { code: 'ENOENT' });
  await assert.rejects(fs.access(path.join(destination, 'previous')), { code: 'ENOENT' });
});

test('failure pruning the previous version reports the already committed destination', async (t) => {
  const directory = await temporary(t);
  const staged = path.join(directory, 'staged');
  const destination = path.join(directory, 'package');
  const previous = staged + '-previous';
  await fs.mkdir(staged);
  await fs.mkdir(destination);
  await fs.writeFile(path.join(staged, 'candidate'), 'new');
  await fs.writeFile(path.join(destination, 'previous'), 'old');
  const cleanupError = new Error('injected previous-output cleanup failure');
  const operations = {
    ...fs,
    rm: async (entry, options) => {
      if (entry === previous) throw cleanupError;
      return fs.rm(entry, options);
    }
  };
  await assert.rejects(replaceDirectory(staged, destination, operations), (error) => {
    assert.equal(error.committed, true, 'the error must say the new output is already live');
    assert.equal(error.cause, cleanupError);
    assert.equal(error.destination, destination);
    assert.equal(error.previousBackup, previous);
    assert.match(error.message, /cleanup/i);
    return true;
  });
  assert.equal(await fs.readFile(path.join(destination, 'candidate'), 'utf8'), 'new');
  assert.equal(await fs.readFile(path.join(previous, 'previous'), 'utf8'), 'old');
});
