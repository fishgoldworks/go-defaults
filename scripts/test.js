const { readdir, stat } = require('node:fs/promises');
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
  const environment = { ...process.env };

  // An outer Node test worker must not turn this independent suite into a nested runner.
  delete environment.NODE_TEST_CONTEXT;
  environment.GO_DEFAULTS_TEST_COMPLETION = '1';

  const output = run(
    process.execPath,
    [
      '--require',
      path.join(__dirname, 'test-completion.cjs'),
      '--test',
      ...coverage,
      ...runtimeFiles(path.join(root, 'test'))
    ],
    root,
    environment
  );

  process.stdout.write(output);

  if (coverage.length) {
    const { assertCoverageInventory } = await import('./coverage-inventory.mjs');
    const authored = [];

    // Keep path traversal: recursive Dirent discovery omits linked-directory descendants.
    for (const relativePath of await readdir(path.join(root, 'src'), { recursive: true })) {
      if (!/\.(?:cjs|mjs|js)$/.test(relativePath)) continue;
      const file = path.join(root, 'src', relativePath);
      const parts = path.relative(root, file).split(path.sep);

      if (parts.slice(0, -1).some((part) => temporaryDirectoryNames.has(part))) continue;
      if ((await stat(file)).isFile()) authored.push(parts.join('/'));
    }

    assertCoverageInventory(output, authored);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
