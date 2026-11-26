import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
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

test('browser worker preserves arguments, output and nonzero failures', async () => {
  const { runBrowserWorker } = await import('../../scripts/browser-worker.mjs');
  const text = 'space and "quote" and trailing\\';
  const normal = await runBrowserWorker(
    ['-e', 'process.stdout.write(process.argv[1]);process.stderr.write("diagnostic");', text],
    { timeoutMs: 15000 }
  );

  assert.equal(normal.stdout, text);
  assert.equal(normal.stderr, 'diagnostic');
  await assert.rejects(
    runBrowserWorker(['-e', 'process.stdout.write("before failure");process.exitCode=7;'], { timeoutMs: 15000 }),
    (error) => error.message.includes('7') && error.stdout === 'before failure'
  );
});

test(
  'browser worker skips a protected process that predates its supervisor',
  { skip: process.platform !== 'linux' },
  async () => {
    const module = new URL('../../scripts/browser-worker.mjs', import.meta.url).href;
    const source = `
    import fs from 'node:fs';
    const readFile = fs.readFileSync;
    fs.readFileSync = function (file, ...args) {
      if (file === '/proc/' + process.ppid + '/environ') {
        throw Object.assign(new Error('fixture process environment is protected'), { code: 'EACCES' });
      }
      return Reflect.apply(readFile, this, [file, ...args]);
    };
    const { runBrowserWorker } = await import(${JSON.stringify(module)});
    const result = await runBrowserWorker(['-e', 'process.stdout.write("complete")'], { timeoutMs: 15000 });
    process.stdout.write(result.stdout);
  `;

    await delay(50);
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
      encoding: 'utf8',
      timeout: 20000
    });

    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'complete');
  }
);

test('browser worker deadline retains partial output and stops detached descendants', async (t) => {
  const { runBrowserWorker } = await import('../../scripts/browser-worker.mjs');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'go-defaults-browser-worker-'));

  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'child.pid');
  const source = `const cp=require('node:child_process');cp.spawn(process.execPath,['-e',${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(file)},String(process.pid));setInterval(()=>{},1000);`)}],{stdio:'ignore',detached:process.platform!=='win32',windowsHide:true});process.stdout.write('started worker');setInterval(()=>{},1000);`;

  await assert.rejects(
    runBrowserWorker(['-e', source], { timeoutMs: 5000 }),
    (error) => /timed out/i.test(error.message) && error.stdout.includes('started worker')
  );
  const pid = Number(await fs.readFile(file, 'utf8'));
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
      /* Preserve failed cleanup evidence. */
    }
  }

  assert.equal(alive, false);
});

test('browser worker closes descendants after a premature zero exit', async (t) => {
  const { runBrowserWorker } = await import('../../scripts/browser-worker.mjs');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'go-defaults-browser-early-exit-'));

  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'child.pid');
  const child = `require('node:fs').writeFileSync(${JSON.stringify(file)},String(process.pid));setInterval(()=>{},1000);`;
  const source = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(child)}],{stdio:'ignore',detached:process.platform!=='win32',windowsHide:true});const fs=require('node:fs');const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(file)})){clearInterval(timer);process.exit(0);}},10);`;

  await runBrowserWorker(['-e', source], { timeoutMs: 15000 });
  const pid = Number(await fs.readFile(file, 'utf8'));
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
      /* Already stopped. */
    }
  }

  assert.equal(alive, false);
});

test('browser worker bounds captured output without losing the output-limit failure', async () => {
  const { runBrowserWorker } = await import('../../scripts/browser-worker.mjs');

  await assert.rejects(
    runBrowserWorker(['-e', 'process.stdout.write("x".repeat(5*1024*1024));setInterval(()=>{},1000);'], {
      timeoutMs: 15000
    }),
    (error) => /output exceeded/i.test(error.message) && Buffer.byteLength(error.stdout) <= 4 * 1024 * 1024
  );
});

test('browser worker preserves Unicode split across output chunks', async () => {
  const { runBrowserWorker } = await import('../../scripts/browser-worker.mjs');
  const source =
    'const b=Buffer.from("雪🙂");process.stdout.write(b.subarray(0,1));process.stderr.write(b.subarray(0,2));setTimeout(()=>{process.stdout.write(b.subarray(1));process.stderr.write(b.subarray(2));},100);';
  const result = await runBrowserWorker(['-e', source], { timeoutMs: 15000 });

  assert.equal(result.stdout, '雪🙂');
  assert.equal(result.stderr, '雪🙂');
});

test(
  'browser worker stops reparented native descendants without stopping unrelated processes',
  { skip: process.platform !== 'linux' },
  async (t) => {
    const { runBrowserWorker } = await import('../../scripts/browser-worker.mjs');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'go-defaults-browser-native-'));
    const unrelated = spawn('/bin/sleep', ['30'], { detached: true, stdio: 'ignore' });

    t.after(async () => {
      unrelated.kill('SIGKILL');
      await fs.rm(directory, { recursive: true, force: true });
    });
    for (const mode of ['timeout', 'exit']) {
      const file = path.join(directory, mode + '.pid');
      const inner = 'echo $$ > ' + JSON.stringify(file) + '; exec sleep 30';
      const shell =
        'setsid /bin/sh -c ' + "'" + inner.replaceAll("'", "'\\''") + "'" + ' </dev/null >/dev/null 2>&1 & exit 0';
      const source = `require('node:child_process').spawn('/bin/sh',['-c',${JSON.stringify(shell)}],{stdio:'ignore'});const fs=require('node:fs');setInterval(()=>{if(fs.existsSync(${JSON.stringify(file)})&&${JSON.stringify(mode)}==='exit')process.exit(0);},10);`;
      let pid;

      try {
        const result = runBrowserWorker(['-e', source], { timeoutMs: 1500 });

        if (mode === 'timeout') await assert.rejects(result, /timed out/);
        else await result;
        pid = Number(await fs.readFile(file, 'utf8'));
        for (let attempt = 0; attempt < 30 && running(pid); attempt++) await delay(20);
        assert.equal(running(pid), false, mode + ' left a native descendant running');
        assert.equal(running(unrelated.pid), true, 'unrelated process must survive cleanup');
      } finally {
        pid ??= Number(await fs.readFile(file, 'utf8').catch(() => '0'));
        if (pid && running(pid)) process.kill(-pid, 'SIGKILL');
      }
    }
  }
);

test(
  'browser worker bounds the complete Unix process inspection, including slow identity queries',
  { skip: process.platform !== 'linux' },
  async (t) => {
    const { runBrowserWorker } = await import('../../scripts/browser-worker.mjs');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'go-defaults-browser-budget-'));
    const ps = path.join(directory, 'ps');
    const originalPath = process.env.PATH;

    await fs.writeFile(ps, '#!/bin/sh\nif [ "$1" = "-p" ]; then sleep 0.65; fi\nexec /bin/ps "$@"\n');
    await fs.chmod(ps, 0o755);
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const source =
      'const cp=require("node:child_process");for(let i=0;i<8;i++)cp.spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});process.stdout.write("spawned eight children");setInterval(()=>{},1000);';
    const start = performance.now();

    try {
      // Select the non-Linux identity adapter on this real Unix host. Each ps
      // query is individually below its old limit but their sum exceeds it.
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      process.env.PATH = directory + ':' + originalPath;
      await assert.rejects(runBrowserWorker(['-e', source], { timeoutMs: 1000 }), (error) => {
        assert.match(error.stdout, /spawned eight children/);
        assert.match(error.errors?.[0]?.message || error.message, /timed out/);
        assert.ok(error.errors.some((item) => /cleanup deadline|ETIMEDOUT/.test(item.message)));

        return true;
      });
    } finally {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      process.env.PATH = originalPath;
    }

    assert.ok(performance.now() - start < 5500, 'per-process waits must share the whole inspection budget');
  }
);
