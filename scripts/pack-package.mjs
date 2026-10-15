import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, packageRoot } from './package-layout.mjs';
import { npm } from './process.mjs';
export async function packPackage(directory = path.join(root, 'artifacts')) {
  await mkdir(directory, { recursive: true });
  const packed = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', directory], packageRoot));
  if (packed.length !== 1 || !packed[0].filename) throw new Error('npm pack must report exactly one archive');
  const tarball = path.join(directory, packed[0].filename);
  const sha256 = createHash('sha256')
    .update(await readFile(tarball))
    .digest('hex');
  await writeFile(tarball + '.sha256', sha256 + '\n');
  console.log(JSON.stringify({ tarball, sha256 }));
  return { tarball, sha256 };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length > 2) throw new Error('Usage: npm run pack:package');
  const { buildPackage } = await import('./build.mjs');
  await buildPackage();
  await packPackage();
}
