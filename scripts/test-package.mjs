import { createHash } from 'node:crypto';
import { npm, run } from './process.mjs';
import { checkArtifacts } from './test-artifacts.mjs';
import { copyFile, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkTypes } from './test-types.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const browser = args.length === 3 && args[2] === '--browser';
if ((args.length !== 2 && !browser) || args[0] !== '--tarball')
  throw new Error('Usage: npm run test:package -- --tarball <existing-candidate.tgz> [--browser]');
const tarball = path.resolve(args[1]);
const bytes = await readFile(tarball); // Fail before installing or packing when the supplied archive is missing.
const digest = (value) => createHash('sha256').update(value).digest('hex');
const sha256 = digest(bytes);
console.log(JSON.stringify({ tarball, sha256 }));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'go-defaults-consumer-'));

try {
  await writeFile(path.join(temporary, 'package.json'), JSON.stringify({ private: true }));
  process.stdout.write(
    npm(
      ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', tarball],
      temporary
    )
  );

  const installed = path.join(temporary, 'node_modules/go-defaults');
  for (const file of ['README.md', 'docs/API.md', 'LICENSE.md', 'CHANGELOG.md']) {
    assert.deepEqual(
      await readFile(path.join(installed, file)),
      await readFile(path.join(root, file)),
      'Installed documentation differs: ' + file
    );
  }
  await checkArtifacts(installed);
  for (const mode of ['cjs', 'mjs']) {
    await copyFile(path.join(root, 'test/consumers/consumer.' + mode), path.join(temporary, 'consumer.' + mode));
    process.stdout.write(run(process.execPath, ['consumer.' + mode], temporary));
    const runtime = process.env[mode === 'cjs' ? 'GO_DEFAULTS_NODE8' : 'GO_DEFAULTS_ESM_NODE'];
    if (runtime) process.stdout.write(run(runtime, ['consumer.' + mode], temporary));
    if (mode === 'cjs' && process.env.GO_DEFAULTS_NODE13)
      process.stdout.write(run(process.env.GO_DEFAULTS_NODE13, ['consumer.cjs'], temporary));
  }
  require('./docs.js').validateLinks(installed);
  require('./test-examples.js').runAll(installed, temporary);
  require('./test-examples.js').checkTypes(installed);
  const testDirectory = path.join(temporary, 'test');
  await mkdir(testDirectory);
  for (const folder of ['runtime', 'types', 'consumers']) {
    const destination = path.join(testDirectory, folder);
    await mkdir(destination);
    for (const entry of await readdir(path.join(root, 'test', folder), { withFileTypes: true })) {
      // Maintained fixtures are direct children. Local experiment directories are never copied.
      if (entry.isFile())
        await copyFile(path.join(root, 'test', folder, entry.name), path.join(destination, entry.name));
    }
  }
  const runtimeTests = (await readdir(path.join(testDirectory, 'runtime')))
    .filter((name) => name.endsWith('.test.cjs'))
    .sort()
    .map((name) => 'test/runtime/' + name);
  assert.ok(runtimeTests.length, 'No installed runtime tests found');
  process.stdout.write(
    run(process.execPath, ['--test', ...runtimeTests], temporary, {
      ...process.env,
      GO_DEFAULTS_TEST_PACKAGE_ONLY: '1'
    })
  );
  await checkTypes({ directory: installed });
  if (browser) {
    const { checkBrowser } = await import('./test-browser.mjs');
    checkBrowser(installed);
  }
  assert.equal(digest(await readFile(tarball)), sha256, 'Candidate changed during verification');
  console.log('Verified SHA256 ' + sha256);
  console.log('Packed consumer runtime and CommonJS/ESM declarations passed.');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
