const { readdir } = require('node:fs/promises');
const path = require('node:path');
const runtimeFiles = require('../test/helpers/runtime-files.cjs');

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== '--coverage'))
    throw new Error('Usage: node scripts/test.js [--coverage]');

  const { root, temporaryDirectoryNames } = await import('./package-layout.mjs');
  const { run } = await import('./process.mjs');
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
  const output = run(process.execPath, ['--test', ...coverage, ...runtimeFiles(path.join(root, 'test'))], root);
  process.stdout.write(output);

  if (coverage.length) {
    const { assertCoverageInventory } = await import('./coverage-inventory.mjs');
    const authored = (await readdir(path.join(root, 'src'), { recursive: true }))
      .filter((name) => /\.(?:cjs|mjs|js)$/.test(name))
      .map((name) => name.split(path.sep))
      .filter((parts) => !parts.slice(0, -1).some((part) => temporaryDirectoryNames.has(part)))
      .map((parts) => 'src/' + parts.join('/'));
    assertCoverageInventory(output, authored);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
