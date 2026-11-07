import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkArtifacts } from '../scripts/test-artifacts.mjs';
import { packageRoot } from '../scripts/package-layout.mjs';

async function temporary(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'go-defaults-recovery-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

test('artifact validation rejects corrupted embedded source contents', async (t) => {
  const directory = await temporary(t);
  await fs.cp(packageRoot, directory, { recursive: true });
  const file = path.join(directory, 'dist/withDefaults.cjs.map');
  const map = JSON.parse(await fs.readFile(file, 'utf8'));
  map.sourcesContent[0] += '\n// stale source';
  await fs.writeFile(file, JSON.stringify(map));
  await assert.rejects(checkArtifacts(directory), /Source map content mismatch/);
});
