import path from 'node:path';
import { root } from './package-layout.mjs';
import { npm } from './process.mjs';
import { packPackage } from './pack-package.mjs';
const all = process.argv.length === 3 && process.argv[2] === '--all';
if (process.argv.length > 2 && !all) throw new Error('Usage: node scripts/verify.mjs [--all]');
for (const script of [
  'build',
  'test:docs',
  'coverage',
  'test:types',
  'test:build',
  'test:tooling',
  'test:artifacts',
  'lint',
  'format:check'
]) {
  process.stdout.write(npm(['run', script], root));
}
const { tarball } = await packPackage(path.join(root, 'artifacts'));
process.stdout.write(npm(['run', 'test:package', '--', '--tarball', tarball, ...(all ? ['--browser'] : [])], root));
