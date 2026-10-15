import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { entries, names, packageRoot, consumerFiles, browserBundles } from './package-layout.mjs';
export async function checkArtifacts(directory = packageRoot, { browser = true } = {}) {
  const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  assert.equal(manifest.private, undefined);
  for (const field of ['scripts', 'dependencies', 'optionalDependencies', 'devDependencies', 'packageManager', 'bin'])
    assert.equal(manifest[field], undefined, 'Development field shipped: ' + field);
  async function checkTargets(value) {
    if (typeof value === 'string') {
      const resolved = path.resolve(directory, value);
      assert.ok(resolved.startsWith(directory + path.sep), 'Export target escapes package');
      await access(resolved);
    } else for (const target of Object.values(value)) await checkTargets(target);
  }
  await checkTargets(manifest.exports);
  await checkTargets(manifest.types);
  const require = createRequire(path.join(directory, 'package.json'));
  const api = require(path.join(directory, manifest.main));
  const esm = await import(pathToFileURL(path.join(directory, manifest.module)).href);
  assert.deepEqual(Object.keys(api).sort(), [...names].sort());
  assert.equal(esm.default, api);
  for (const name of names) {
    assert.equal(esm[name], api[name]);
    assert.equal(require(path.join(directory, name + '.js')), api[name]);
    const subpath = await import(pathToFileURL(path.join(directory, 'dist', name + '.mjs')).href);
    assert.equal(subpath.default, api[name]);
    assert.equal(subpath[name], api[name]);
  }
  assert.deepEqual(names.slice().sort(), ['defaultsFor', 'withDefaults']);
  assert.deepEqual(api.withDefaults({ a: 1 }, { a: 2, b: null }), { a: 2, b: null });
  if (browser) {
    for (const field of ['unpkg', 'jsdelivr']) {
      assert.equal(manifest[field], './dist/go-defaults.min.js');
      await checkTargets(manifest[field]);
    }
    const license = (await readFile(path.join(directory, 'LICENSE.md'), 'utf8')).replace(/\r\n/g, '\n').trim();
    for (const filename of browserBundles) {
      const code = await readFile(path.join(directory, 'dist', filename), 'utf8');
      assert.ok(code.includes(license), 'Missing license notice: ' + filename);
      const scope = vm.createContext({});
      vm.runInContext(code, scope, { filename });
      assert.deepEqual(Object.keys(scope.goDefaults).sort(), [...names].sort());
      assert.equal(scope.goDefaults.withDefaults({ count: 10 }, { count: undefined }).count, 10);
    }
  }
  const normalize = (value) => value.replace(/\r\n/g, '\n');
  const runtimeFiles = entries.flatMap((name) => ['cjs', 'mjs'].map((extension) => name + '.' + extension));
  if (browser) runtimeFiles.push(...browserBundles);
  for (const filename of runtimeFiles) {
    const code = await readFile(path.join(directory, 'dist', filename), 'utf8');
    assert.ok(code.includes('//# sourceMappingURL=' + filename + '.map'), 'Missing source map reference: ' + filename);
    const map = JSON.parse(await readFile(path.join(directory, 'dist', filename + '.map'), 'utf8'));
    assert.equal(map.version, 3);
    assert.ok(map.sources.length > 0);
    assert.equal(map.sources.length, map.sourcesContent.length);
    for (let index = 0; index < map.sources.length; index++) {
      const source = path.resolve(directory, 'dist', map.sources[index]);
      assert.ok(
        source.startsWith(path.join(directory, 'src') + path.sep),
        'Source map escapes packaged source: ' + source
      );
      assert.equal(
        normalize(map.sourcesContent[index]),
        normalize(await readFile(source, 'utf8')),
        'Source map content mismatch: ' + filename
      );
    }
  }
  const expected = [
    'package.json',
    ...consumerFiles,
    'dist/_merge.d.cts',
    'dist/_merge.d.ts',
    ...(browser ? browserBundles.flatMap((name) => ['dist/' + name, 'dist/' + name + '.map']) : []),
    ...names.flatMap((name) => [name + '.js', name + '.d.ts'])
  ];
  for (const name of entries) {
    for (const extension of ['cjs', 'mjs'])
      expected.push(
        'src/' + name + '.' + extension,
        'dist/' + name + '.' + extension,
        'dist/' + name + '.' + extension + '.map'
      );
    expected.push('dist/' + name + '.d.cts', 'dist/' + name + '.d.mts', 'dist/' + name + '.d.ts');
  }
  async function inventory(current, prefix = '') {
    const files = [];
    for (const entry of await readdir(current, { withFileTypes: true })) {
      assert.ok(!entry.isSymbolicLink(), 'Unexpected package symlink: ' + entry.name);
      if (entry.isDirectory())
        files.push(...(await inventory(path.join(current, entry.name), prefix + entry.name + '/')));
      else files.push(prefix + entry.name);
    }
    return files;
  }
  assert.deepEqual((await inventory(directory)).sort(), expected.sort(), 'Unexpected or missing package files');
  assert.ok(
    !(await readdir(directory)).some((name) => ['node_modules', 'scripts', 'test'].includes(name)),
    'Maintainer files shipped'
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length > 3) throw new Error('Usage: node scripts/test-artifacts.mjs [package-directory]');
  await checkArtifacts(process.argv[2] ? path.resolve(process.argv[2]) : packageRoot);
  console.log('Entry identities, declarations, metadata and embedded source maps passed.');
}
