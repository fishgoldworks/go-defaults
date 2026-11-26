import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { root } from '../../scripts/package-layout.mjs';

export async function runtimeRunnerFixture(t) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'go-defaults-recovery-'));

  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  // A checkout may itself be inside a temporary parent directory.
  const directory = path.join(temporary, 'temp', 'fixture');

  await fs.mkdir(directory, { recursive: true });
  for (const name of ['scripts', 'src', 'test', 'test/helpers'])
    await fs.mkdir(path.join(directory, name), { recursive: true });
  for (const name of ['test.js', 'test-completion.cjs', 'coverage-inventory.mjs', 'package-layout.mjs', 'process.mjs'])
    await fs.copyFile(path.join(root, 'scripts', name), path.join(directory, 'scripts', name));
  await fs.copyFile(
    path.join(root, 'test/helpers/runtime-files.cjs'),
    path.join(directory, 'test/helpers/runtime-files.cjs')
  );
  await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ private: true }));
  await fs.writeFile(path.join(directory, 'src/index.cjs'), 'module.exports = { value: 1 };\n');
  await fs.writeFile(
    path.join(directory, 'test/covered.test.cjs'),
    "const { test } = require('node:test');\n" +
      "const assert = require('node:assert/strict');\n" +
      "test('covered source', () => assert.equal(require('../src/index.cjs').value, 1));\n"
  );

  return directory;
}
