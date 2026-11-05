// One Node contract discovery path for ordinary execution and coverage.
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { root, temporaryDirectoryNames } from './package-layout.mjs';
import { run } from './process.mjs';
import { assertCoverageInventory } from './coverage-inventory.mjs';
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--coverage'))
  throw new Error('Usage: node scripts/test-contracts.mjs [--coverage]');
const tests = (await readdir(path.join(root, 'test/runtime')))
  .filter((name) => name.endsWith('.test.cjs'))
  .sort()
  .map((name) => 'test/runtime/' + name);
if (!tests.length) throw new Error('No Node contract tests found');
const coverage = args.length
  ? [
      '--test-reporter=tap',
      '--experimental-test-coverage',
      '--test-coverage-include=src/**',
      '--test-coverage-exclude=src/**/.tmp/**',
      '--test-coverage-exclude=src/**/temp/**',
      '--test-coverage-lines=100',
      '--test-coverage-branches=100',
      '--test-coverage-functions=100'
    ]
  : [];
const output = run(process.execPath, ['--test', ...coverage, ...tests], root);
process.stdout.write(output);
if (args.length) {
  const authored = (await readdir(path.join(root, 'src'), { recursive: true }))
    .filter((name) => /\.(?:cjs|mjs|js)$/.test(name))
    .filter(
      (name) =>
        !name
          .split(path.sep)
          .slice(0, -1)
          .some((part) => temporaryDirectoryNames.has(part))
    )
    .map((name) => 'src/' + name.split(path.sep).join('/'));
  assertCoverageInventory(output, authored);
}
