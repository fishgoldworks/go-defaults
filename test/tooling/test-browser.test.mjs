import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { root, packageRoot } from '../../scripts/package-layout.mjs';
const require = createRequire(import.meta.url);
const { processIdentity } = require('../../scripts/browser-processes.cjs');

function running(pid) {
  if (process.platform !== 'win32') {
    return processIdentity(pid) !== undefined;
  }

  try {
    process.kill(pid, 0);

    return true;
  } catch {
    return false;
  }
}

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'go-defaults-browser-runner-'));

  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  return { directory, events: path.join(directory, 'events.jsonl'), pid: path.join(directory, 'descendant.pid') };
}

async function runBrowser(f, mode = 'normal', { inherited = false, missing = false, timeoutMs } = {}) {
  await fs.writeFile(f.events, '');
  const env = {
    ...process.env,
    GO_DEFAULTS_BROWSER_FAULT: mode,
    GO_DEFAULTS_BROWSER_EVENTS: f.events,
    GO_DEFAULTS_BROWSER_CHILD_PID_FILE: f.pid
  };

  if (inherited) env.NODE_TEST_CONTEXT = 'child-v8';
  else delete env.NODE_TEST_CONTEXT;
  env.NODE_OPTIONS = [
    env.NODE_OPTIONS,
    '--require ' + JSON.stringify(path.join(root, 'test/tooling/fixtures/browser-runner.cjs'))
  ]
    .filter(Boolean)
    .join(' ');
  const args = [
    'scripts/test-browser.mjs',
    '--package',
    missing ? path.join(f.directory, 'missing') : packageRoot,
    ...(timeoutMs !== undefined ? ['--timeout-ms', String(timeoutMs)] : [])
  ];
  const child = spawn(process.execPath, args, {
    cwd: root,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32'
  });
  let stdout = '',
    stderr = '',
    externalStop = false;

  child.stdout.on('data', (chunk) => (stdout += chunk));
  child.stderr.on('data', (chunk) => (stderr += chunk));
  const watchdog = setTimeout(() => {
    externalStop = true;
    if (process.platform === 'win32')
      spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
        windowsHide: true,
        stdio: 'ignore',
        timeout: 5000
      });
    else {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* A failed control may have already exited. */
      }
    }
  }, 20000);
  const result = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (status, signal) => resolve({ status, signal }));
  });

  clearTimeout(watchdog);

  return {
    ...result,
    stdout,
    stderr,
    externalStop,
    events: (await fs.readFile(f.events, 'utf8')).split('\n').filter(Boolean).map(JSON.parse)
  };
}

test('browser runner executes its matrix independently of inherited worker state', async (t) => {
  const f = await fixture(t);
  const valid = await runBrowser(f, 'normal', { inherited: true });

  assert.equal(valid.status, 0, valid.stdout + valid.stderr);
  assert.deepEqual(
    valid.events.filter((x) => x.event === 'launch').map((x) => x.engine),
    ['chromium', 'firefox', 'webkit']
  );
  const invalid = await runBrowser(f, 'normal', { inherited: true, missing: true });

  assert.notEqual(invalid.status, 0, invalid.stdout + invalid.stderr);
  assert.match(invalid.stdout + invalid.stderr, /ENOENT|missing/);
});

for (const mode of ['zero-exit', 'zero-exit-cleanup', 'missing-completion', 'incomplete-completion']) {
  test(`browser runner rejects ${mode} instead of accepting an incomplete run`, async (t) => {
    const result = await runBrowser(await fixture(t), mode);

    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /incomplete|completion|matrix/i);
    assert.equal(result.externalStop, false);
  });
}

for (const mode of ['primary-error', 'cleanup-error', 'combined-errors']) {
  test(`browser runner preserves ${mode}`, async (t) => {
    const result = await runBrowser(await fixture(t), mode);

    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    if (mode !== 'cleanup-error') assert.match(result.stdout + result.stderr, /PRIMARY-BROWSER-CONTRACT/);
    if (mode !== 'primary-error') assert.match(result.stdout + result.stderr, /SECONDARY-PAGE-CLEANUP/);
    if (mode === 'combined-errors') assert.match(result.stdout + result.stderr, /TERTIARY-BROWSER-CLEANUP/);
    assert.deepEqual(
      result.events.filter((x) => x.event === 'browser.close').map((x) => x.engine),
      ['chromium', 'firefox', 'webkit']
    );
  });
}

for (const mode of ['stall', 'stall-close', 'stall-descendant', 'kill-error']) {
  test(`browser runner bounds ${mode} and retains timeout/cleanup diagnostics`, async (t) => {
    const f = await fixture(t);
    const result = await runBrowser(f, mode, { timeoutMs: 7000 });

    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.externalStop, false, 'The runner must enforce its own deadline');
    assert.match(result.stdout + result.stderr, /timed out|deadline/i);
    assert.ok(
      result.events.some((event) => event.event === (mode === 'stall-close' ? 'page.close' : 'evaluate')),
      'The fault must reach the intended browser operation before timeout'
    );
    if (mode === 'kill-error') assert.match(result.stdout + result.stderr, /CONTROLLED-TREE-CLEANUP-ERROR/);
    if (mode === 'stall-descendant') {
      const pid = Number(await fs.readFile(f.pid, 'utf8'));
      let alive = true;

      for (let attempt = 0; attempt < 30; attempt++) {
        if (!running(pid)) {
          alive = false;
          break;
        }

        await delay(50);
      }

      if (alive) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          /* Preserve the assertion if cleanup already finished. */
        }
      }

      assert.equal(alive, false, 'Timed-out worker descendants must be stopped');
    }
  });
}

test('browser runner cleans descendants when a worker exits before completion', async (t) => {
  const f = await fixture(t);
  const result = await runBrowser(f, 'zero-exit-descendant');

  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  const pid = Number(await fs.readFile(f.pid, 'utf8'));
  let alive = true;

  for (let attempt = 0; attempt < 30; attempt++) {
    if (!running(pid)) {
      alive = false;
      break;
    }

    await delay(50);
  }

  if (alive) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* Already gone. */
    }
  }

  assert.equal(alive, false, 'Incomplete exits must not leave descendants running');
});

test('browser runner rejects invalid deadlines before starting browser work', async (t) => {
  const f = await fixture(t);

  for (const value of [0, -1, Infinity, 'abc', 2147483648]) {
    const result = await runBrowser(f, 'normal', { timeoutMs: value });

    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /timeout|deadline/i);
    assert.equal(result.events.length, 0);
  }
});
