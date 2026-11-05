import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
export const names = Object.keys(createRequire(import.meta.url)('../src/index.cjs'));
export const entries = ['index', ...names];
export const browserBundles = ['go-defaults.js', 'go-defaults.min.js'];
export const packageRoot = path.join(root, 'package');
export const temporaryDirectoryNames = new Set(['.tmp', 'temp']);
export const consumerFiles = ['README.md', 'LICENSE.md', 'CHANGELOG.md', 'docs/API.md'];
export function entryTarget(name, prefix = './dist/') {
  // Node 13.0 recognises exports arrays but needs a literal fallback before conditional exports support.
  const target = {
    types: { import: prefix + name + '.d.mts', require: prefix + name + '.d.cts', default: prefix + name + '.d.cts' },
    import: prefix + name + '.mjs',
    require: prefix + name + '.cjs',
    default: prefix + name + '.cjs'
  };
  return [target, target.default];
}
export function consumerManifest({ browser = true } = {}) {
  const output = {};
  for (const key of [
    'name',
    'version',
    'description',
    'license',
    'author',
    'keywords',
    'repository',
    'homepage',
    'bugs'
  ])
    if (metadata[key] !== undefined) output[key] = metadata[key];
  Object.assign(output, {
    // Module entry points are pure; standalone scripts may install the browser global.
    sideEffects: browser ? browserBundles.map((name) => './dist/' + name) : false,
    engines: { node: '>=8.0.0' },
    main: './dist/index.cjs',
    module: './dist/index.mjs',
    types: './dist/index.d.ts',
    exports: Object.fromEntries(entries.map((name) => [name === 'index' ? '.' : './' + name, entryTarget(name)])),
    files: ['dist', 'src', '*.js', '*.d.ts', ...consumerFiles]
  });
  if (browser) {
    output.unpkg = './dist/go-defaults.min.js';
    output.jsdelivr = './dist/go-defaults.min.js';
  }
  // Order only manifest fields; nested conditions and fallback arrays retain their precedence.
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    if (output[field])
      output[field] = Object.fromEntries(Object.entries(output[field]).sort(([a], [b]) => a.localeCompare(b)));
  }
  const fields = [
    'name',
    'version',
    'description',
    'license',
    'author',
    'contributors',
    'email',
    'keywords',
    'homepage',
    'repository',
    'bugs',
    'funding',
    'type',
    'engines',
    'main',
    'module',
    'browser',
    'types',
    'typesVersions',
    'exports',
    'imports',
    'bin',
    'unpkg',
    'jsdelivr',
    'files',
    'sideEffects',
    'publishConfig',
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
    'peerDependenciesMeta'
  ];
  return Object.fromEntries(
    fields.filter((field) => output[field] !== undefined).map((field) => [field, output[field]])
  );
}
