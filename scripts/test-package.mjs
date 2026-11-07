import { run } from './process.mjs';
import { checkArtifacts } from './test-artifacts.mjs';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkTypes } from './test-types.mjs';
import { readCandidate, withInstalledCandidate, comparePackage } from './candidate.mjs';
import runConsumer from './test-runtime.js';
import runtimeFiles from '../test/helpers/runtime-files.cjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { values } = parseArgs({
  options: { tarball: { type: 'string' }, browser: { type: 'boolean' }, 'compare-package': { type: 'string' } }
});
if (!values.tarball) throw new Error('Usage: npm run test:package -- --tarball <existing-candidate.tgz> [--browser]');
const candidate = await readCandidate(values.tarball);
console.log(JSON.stringify(candidate));

await withInstalledCandidate(candidate, async (temporary, installed) => {
  if (values['compare-package'] !== undefined) await comparePackage(installed, path.resolve(values['compare-package']));
  require('./lib/check-library-readme.cjs').checkPackage(installed);
  for (const file of ['README.md', 'docs/API.md', 'LICENSE.md', 'CHANGELOG.md']) {
    assert.deepEqual(
      await readFile(path.join(installed, file)),
      await readFile(path.join(root, file)),
      'Installed documentation differs: ' + file
    );
  }
  await checkArtifacts(installed);
  for (const mode of ['cjs', 'mjs']) {
    await runConsumer(temporary, process.execPath, mode);
    const runtime = process.env[mode === 'cjs' ? 'GO_DEFAULTS_NODE8' : 'GO_DEFAULTS_ESM_NODE'];
    if (runtime) await runConsumer(temporary, runtime, mode);
    if (mode === 'cjs' && process.env.GO_DEFAULTS_NODE13)
      await runConsumer(temporary, process.env.GO_DEFAULTS_NODE13, mode);
  }
  require('./docs.js').validateLinks(installed);
  require('./test-examples.js').runAll(installed, temporary);
  require('./test-examples.js').checkTypes(installed);
  const testDirectory = path.join(temporary, 'test');
  for (const folder of ['helpers', 'browser']) await mkdir(path.join(testDirectory, folder), { recursive: true });
  const runtimeTests = runtimeFiles(path.join(root, 'test'));
  const browserTests = ['browser/bundles.test.cjs', 'browser/browser-contract.cjs'];
  for (const file of [
    ...runtimeTests.map((file) => path.basename(file)),
    'helpers/runtime-targets.cjs',
    ...browserTests
  ])
    await copyFile(path.join(root, 'test', file), path.join(testDirectory, file));

  process.stdout.write(
    run(
      process.execPath,
      ['--test', ...runtimeFiles(testDirectory), path.join(testDirectory, browserTests[0])],
      temporary,
      {
        ...process.env,
        GO_DEFAULTS_TEST_PACKAGE_ONLY: '1'
      }
    )
  );
  await checkTypes({ directory: installed });
  if (values.browser) {
    const { checkBrowser } = await import('./test-browser.mjs');
    checkBrowser(installed);
  }
});
console.log('Verified SHA-256 ' + candidate.sha256);
console.log('Packed consumer runtime and CommonJS/ESM declarations passed.');
