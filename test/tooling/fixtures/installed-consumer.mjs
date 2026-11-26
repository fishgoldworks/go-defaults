import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { root } from '../../../scripts/package-layout.mjs';
import { npm } from '../../../scripts/process.mjs';

export async function installedConsumer(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'go-defaults-installed-regression-'));

  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  for (const name of [
    'scripts',
    'test',
    'src',
    'package',
    'package.json',
    '.nvmrc',
    'README.md',
    'docs',
    'LICENSE.md',
    'CHANGELOG.md'
  ])
    await fs.cp(path.join(root, name), path.join(directory, name), { recursive: true });
  await fs.symlink(
    path.join(root, 'node_modules'),
    path.join(directory, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir'
  );
  const temporary = path.join(directory, 'temporary');

  await fs.mkdir(temporary);
  const entry = path.join(directory, 'package/dist/index.cjs');
  const original = await fs.readFile(entry, 'utf8');
  const helper = path.join(directory, 'package/dist/withDefaults.cjs');
  const originalHelper = await fs.readFile(helper, 'utf8');

  async function pack(mode = 'normal') {
    const destination = path.join(directory, 'archives', mode);

    await fs.mkdir(destination, { recursive: true });
    const prefix =
      mode === 'exit'
        ? 'process.exit(0);\n'
        : mode === 'throw'
          ? 'throw new Error("Installed candidate failure control");\n'
          : '';

    await fs.writeFile(entry, prefix + original);
    await fs.writeFile(
      helper,
      originalHelper + (mode === 'call-exit' ? '\nmodule.exports = function () { process.exit(0); };\n' : '')
    );
    const output = JSON.parse(
      npm(['pack', '--ignore-scripts', '--json', '--pack-destination', destination], path.join(directory, 'package'))
    );

    return path.join(destination, output[0].filename);
  }

  function run(script, args, overrides = {}) {
    const env = { ...process.env, TEMP: temporary, TMP: temporary };

    delete env.NODE_TEST_CONTEXT;
    delete env.GO_DEFAULTS_TEST_COMPLETION;

    return spawnSync(process.execPath, [path.join('scripts', script), ...args], {
      cwd: directory,
      env: { ...env, ...overrides },
      encoding: 'utf8',
      timeout: 90000,
      maxBuffer: 12 * 1024 * 1024
    });
  }

  async function remainingConsumers() {
    return (await fs.readdir(temporary)).filter((name) => name.startsWith('go-defaults-consumer-'));
  }

  return { directory, temporary, pack, run, remainingConsumers };
}
