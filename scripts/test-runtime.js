const assert = require('node:assert/strict');
const { copyFile } = require('node:fs/promises');
const path = require('node:path');
const { parseArgs } = require('node:util');

async function runConsumer(directory, executable, mode) {
  const { run } = await import('./process.mjs');
  const file = 'consumer.' + mode;
  await copyFile(path.join(__dirname, '../test/package', file), path.join(directory, file));
  process.stdout.write(run(executable, [file], directory));
}

async function main() {
  const { values } = parseArgs({ options: { tarball: { type: 'string' }, node: { type: 'string' } } });
  if (!values.tarball || !values.node)
    throw new Error('Usage: npm run test:runtime -- --tarball <candidate.tgz> --node <node-executable>');

  const { readCandidate, withInstalledCandidate } = await import('./candidate.mjs');
  const candidate = await readCandidate(values.tarball);
  const { run } = await import('./process.mjs');
  const executable = path.resolve(values.node);
  const version = run(executable, ['--version'], process.cwd()).trim();
  const parts = /^v(\d+)\.(\d+)\.\d+$/.exec(version);
  assert.ok(parts && Number(parts[1]) >= 8, 'Expected a supported Node.js runtime, received ' + version);
  const [, major, minor] = parts.map(Number);

  console.log(JSON.stringify(candidate));
  await withInstalledCandidate(candidate, async (directory) => {
    await runConsumer(directory, executable, 'cjs');
    if (major >= 14 || (major === 12 && minor >= 17)) await runConsumer(directory, executable, 'mjs');
  });
}

module.exports = runConsumer;
if (require.main === module)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
