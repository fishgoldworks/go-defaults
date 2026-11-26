import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertCoverageInventory } from '../../scripts/coverage-inventory.mjs';

for (const directory of ['group.js', 'group.cjs', 'group.mjs', 'file', 'all files']) {
  test('coverage columns distinguish the directory ' + directory + ' from files and headers', () => {
    const report = [
      '# start of coverage report',
      '# file | line % | branch % | funcs % | uncovered lines',
      '# src | | | |',
      '#  ' + directory + ' | | | |',
      '#   helper.cjs | 100.00 | 100.00 | 100.00 |',
      '#  sibling | | | |',
      '#   helper.cjs | 100.00 | 100.00 | 100.00 |',
      '# all files | 100.00 | 100.00 | 100.00 |',
      '# end of coverage report'
    ].join('\n');
    const expected = ['src/' + directory + '/helper.cjs', 'src/sibling/helper.cjs'];

    assert.doesNotThrow(() => assertCoverageInventory(report, expected));
    assert.throws(
      () => assertCoverageInventory(report, [...expected, 'src/' + directory + '/unloaded.mjs']),
      /Missing source coverage entry:.*unloaded\.mjs/
    );
  });
}

test('only rows with coverage measurements can satisfy an expected source file', () => {
  for (const columns of [' | | |', 'unknown | 100.00 | 100.00 |']) {
    const report = [
      '# start of coverage report',
      '# file | line % | branch % | funcs % | uncovered lines',
      '# src | | | |',
      '#  unloaded.cjs | ' + columns,
      '# all files | 100.00 | 100.00 | 100.00 |',
      '# end of coverage report'
    ].join('\n');

    assert.throws(
      () => assertCoverageInventory(report, ['src/unloaded.cjs']),
      /Missing source coverage entry: src\/unloaded\.cjs/
    );
  }
});

test('coverage inventory detects source modules missing from an otherwise green report', () => {
  const report = [
    '# start of coverage report',
    '# file | line % | branch % | funcs % | uncovered lines',
    '# src | | | |',
    '#  index.cjs | 100.00 | 100.00 | 100.00 |',
    '#  nested | | | |',
    '#   helper.mjs | 100.00 | 100.00 | 100.00 |',
    '# all files | 100.00 | 100.00 | 100.00 |',
    '# end of coverage report'
  ].join('\n');

  assert.doesNotThrow(() => assertCoverageInventory(report, ['src/index.cjs', 'src/nested/helper.mjs']));
  assert.throws(
    () => assertCoverageInventory(report, ['src/index.cjs', 'src/nested/helper.mjs', 'src/untested.cjs']),
    /Missing source coverage entry: src\/untested\.cjs/
  );
  assert.throws(
    () => assertCoverageInventory('No coverage report', ['src/index.cjs']),
    /Missing or malformed coverage report/
  );
});
