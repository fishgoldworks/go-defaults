import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkArtifacts } from '../scripts/test-artifacts.mjs';
import { packageRoot } from '../scripts/package-layout.mjs';

async function temporary(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'go-defaults-recovery-'));

  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  return directory;
}

test('artifact validation accepts working Node and composed browser source maps', async () => {
  await checkArtifacts(packageRoot);
});

const corruptions = [
  ['missing mappings', 'withDefaults.cjs', { mappings: undefined }, /Source map mappings/],
  ['empty Node mappings', 'withDefaults.cjs', { mappings: '' }, /Source map mappings/],
  ['non-string mappings', 'defaultIf.cjs', { mappings: [] }, /Source map mappings/],
  ['empty minified mappings', 'go-defaults.min.js', { mappings: '' }, /Source map mappings/],
  ['invalid mapping characters', 'go-defaults.js', { mappings: '!' }, /Source map mappings/],
  ['unterminated mapping values', 'createDefaultsMerger.cjs', { mappings: 'g' }, /Source map mappings/],
  ['invalid segment lengths', 'defaultIf.cjs', { mappings: 'AA' }, /Source map mappings/],
  ['empty mapping segments', 'index.cjs', { mappings: 'AAAA,' }, /Source map mappings/],
  ['invalid source indices', 'withDefaults.cjs', { mappings: 'ACAA' }, /Source map mappings/],
  ['negative original lines', 'withDefaults.cjs', { mappings: 'AADA' }, /Source map mappings/],
  ['invalid name indices', 'defaultIf.cjs', { mappings: 'AAAAA', names: [] }, /Source map mappings/],
  ['wrong Node locations', 'withDefaults.cjs', { mappings: 'AAAA' }, /Source map location/],
  ['wrong ESM locations', 'defaultIf.mjs', { mappings: 'AAAA' }, /Source map location/],
  ['wrong minified locations', 'go-defaults.min.js', { mappings: 'AAAA' }, /Source map location/]
];

for (const [name, filename, changes, expected] of corruptions) {
  test('artifact validation rejects ' + name, async (t) => {
    const directory = await temporary(t);

    await fs.cp(packageRoot, directory, { recursive: true });
    const file = path.join(directory, 'dist', filename + '.map');
    const map = JSON.parse(await fs.readFile(file, 'utf8'));

    Object.assign(map, changes);
    await fs.writeFile(file, JSON.stringify(map));
    await assert.rejects(checkArtifacts(directory), expected);
  });
}

for (const [name, segment, reason] of [
  ['generated columns outside the artifact', 'ggCAAA', 'generated column is out of range'],
  ['original columns outside the source', 'AAAggC', 'original column is out of range'],
  ['mapping values beyond integer precision', 'ggggggggggggEAAA', 'value exceeds integer precision'],
  ['signed-zero generated columns', 'B', 'generated column is out of range']
]) {
  test('artifact validation rejects ' + name + ' after valid mappings', async (t) => {
    const directory = await temporary(t);

    await fs.cp(packageRoot, directory, { recursive: true });
    const file = path.join(directory, 'dist/withDefaults.cjs.map');
    const map = JSON.parse(await fs.readFile(file, 'utf8'));

    map.mappings += ';' + segment;
    await fs.writeFile(file, JSON.stringify(map));
    await assert.rejects(checkArtifacts(directory), (error) => {
      assert.match(error.message, /Source map mappings/);
      assert.ok(error.message.includes(reason), error.message);

      return true;
    });
  });
}

test('artifact validation rejects an incorrect final source-map reference', async (t) => {
  const directory = await temporary(t);

  await fs.cp(packageRoot, directory, { recursive: true });
  await fs.appendFile(path.join(directory, 'dist/defaultIf.cjs'), '\n//# sourceMappingURL=wrong.map\n');
  await assert.rejects(checkArtifacts(directory), /Missing source map reference/);
});

test('artifact validation rejects corrupted embedded source contents', async (t) => {
  const directory = await temporary(t);

  await fs.cp(packageRoot, directory, { recursive: true });
  const file = path.join(directory, 'dist/withDefaults.cjs.map');
  const map = JSON.parse(await fs.readFile(file, 'utf8'));

  map.sourcesContent[0] += '\n// stale source';
  await fs.writeFile(file, JSON.stringify(map));
  await assert.rejects(checkArtifacts(directory), /Source map content mismatch/);
});
