import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { root, packageRoot } from './package-layout.mjs';
import { runBrowserWorker, browserDeadline } from './browser-worker.mjs';

export async function checkBrowser(directory = packageRoot, { timeoutMs = 180000 } = {}) {
  browserDeadline(timeoutMs);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'go-defaults-browser-completion-'));
  const file = path.join(temporary, 'completed.json'),
    token = randomUUID();
  const env = {
    ...process.env,
    GO_DEFAULTS_BROWSER_PACKAGE: path.resolve(directory),
    GO_DEFAULTS_BROWSER_COMPLETION_FILE: file,
    GO_DEFAULTS_BROWSER_COMPLETION_TOKEN: token
  };

  delete env.NODE_TEST_CONTEXT;
  let failure;

  try {
    await runBrowserWorker(['--test', 'test/browser/browser.test.cjs'], {
      cwd: root,
      env,
      timeoutMs,
      onStdout: (text) => process.stdout.write(text),
      onStderr: (text) => process.stderr.write(text)
    });
    try {
      const record = JSON.parse(await fs.readFile(file, 'utf8'));
      const engines = ['chromium', 'firefox', 'webkit'];
      const cases = [
        'go-defaults.js',
        'go-defaults.min.js',
        'minified application consumer preserves input validation',
        'documented script-tag example'
      ];

      assert.equal(record.token, token);
      assert.deepEqual(record.engines.sort(), engines.sort());
      assert.deepEqual(
        record.cases.sort(),
        engines.flatMap((engine) => cases.map((name) => engine + '/' + name)).sort()
      );
    } catch (error) {
      throw new Error('Browser test execution incomplete: missing or invalid completion matrix.', { cause: error });
    }
  } catch (error) {
    failure = { error };
  }

  try {
    await fs.rm(temporary, { recursive: true, force: true });
  } catch (error) {
    if (failure)
      throw new AggregateError([failure.error, error], 'Browser verification and completion cleanup failed.', {
        cause: error
      });
    throw error;
  }

  if (failure) throw failure.error;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: { package: { type: 'string' }, 'timeout-ms': { type: 'string' } } });

    await checkBrowser(values.package ?? packageRoot, {
      timeoutMs: values['timeout-ms'] === undefined ? 180000 : Number(values['timeout-ms'])
    });
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
