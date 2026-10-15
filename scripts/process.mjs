import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export function run(command, args, cwd, environment = process.env) {
  try {
    return execFileSync(command, args, { cwd, env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    if (error.stdout) process.stdout.write(error.stdout);
    if (error.stderr) process.stderr.write(error.stderr);
    throw error;
  }
}
export function npm(args, cwd) {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')
  ];
  try {
    candidates.push(require.resolve('npm/bin/npm-cli.js'));
  } catch {
    /* npm also ships beside standalone Node distributions. */
  }
  const cli = candidates.find((file) => file && /npm-cli\.js$/.test(file) && existsSync(file));
  if (!cli) throw new Error('npm CLI is required; install npm alongside the contributor Node runtime.');
  return run(process.execPath, [cli, ...args], cwd);
}
