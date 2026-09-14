import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.resolve(root, 'dist');
const entries = ['index', 'wait', 'result', 'isJson', 'parseBool', 'defaultsFor', 'withDefaults'];

if (path.dirname(dist) !== root || path.basename(dist) !== 'dist') {
  throw new Error(`Refusing to replace unexpected build directory: ${dist}`);
}

await rm(dist, { force: true, recursive: true });
await mkdir(dist, { recursive: true });

for (const name of entries) {
  await build({
    entryPoints: [path.join(root, `src/${name}.cjs`)],
    outfile: path.join(dist, `${name}.cjs`),
    bundle: false,
    format: 'cjs',
    legalComments: 'inline',
    platform: 'neutral',
    sourcemap: true,
    target: 'es2022'
  });
  await build({
    entryPoints: [path.join(root, `src/${name}.mjs`)],
    outfile: path.join(dist, `${name}.mjs`),
    bundle: false,
    format: 'esm',
    legalComments: 'inline',
    platform: 'neutral',
    sourcemap: true,
    target: 'es2022'
  });
}

for (const name of await readdir(path.join(root, 'types'))) {
  await copyFile(path.join(root, 'types', name), path.join(dist, name));
}
