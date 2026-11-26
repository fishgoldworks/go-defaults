import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceMap } from 'node:module';
import path from 'node:path';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const guardMessages = {
  'mergeDefaults.cjs': 'Source layers must be objects, null, or undefined.',
  'createDefaultsMerger.cjs': 'shouldFallback must return a boolean.',
  'defaultIf.cjs': 'A value and fallback are required.'
};
const moduleMarkers = { ...guardMessages, 'withDefaults.cjs': 'return mergeDefaults', 'index.cjs': 'module.exports' };
const lines = (text) => text.split(/\r?\n/);

function decodeSegment(segment, check) {
  const fields = [];
  let cursor = 0;

  while (cursor < segment.length) {
    check(fields.length < 5, 'too many segment fields');
    let value = 0;
    let multiplier = 1;
    let digit;

    do {
      check(cursor < segment.length, 'unterminated value');
      digit = alphabet.indexOf(segment[cursor++]);
      check(digit >= 0, 'invalid character');
      value += (digit & 31) * multiplier;
      check(Number.isSafeInteger(value), 'value exceeds integer precision');
      multiplier *= 32;
    } while (digit & 32);

    check(value < 2 ** 32, 'value exceeds 32-bit range');
    // Source maps reserve the signed-zero encoding for the minimum 32-bit integer.
    fields.push(value === 1 ? -(2 ** 31) : value % 2 ? -Math.floor(value / 2) : value / 2);
  }

  check(fields.length === 1 || fields.length === 4 || fields.length === 5, 'invalid segment length');

  return fields;
}

function checkMappings(map, code, filename) {
  const check = (condition, reason) =>
    assert.ok(condition, 'Source map mappings are invalid: ' + filename + ' (' + reason + ')');

  check(typeof map.mappings === 'string' && map.mappings.length > 0, 'missing mapping data');
  const names = map.names === undefined ? [] : map.names;

  check(Array.isArray(names) && names.every((name) => typeof name === 'string'), 'invalid names');
  const generated = lines(code);
  const originals = map.sourcesContent.map(lines);
  let source = 0;
  let originalLine = 0;
  let originalColumn = 0;
  let name = 0;
  let mapped = 0;

  for (const [line, encoded] of map.mappings.split(';').entries()) {
    if (!encoded) continue;
    check(line < generated.length, 'generated line is out of range');
    let column = 0;

    for (const segment of encoded.split(',')) {
      const fields = decodeSegment(segment, check);

      column += fields[0];
      check(column >= 0 && column <= generated[line].length, 'generated column is out of range');
      if (fields.length === 1) continue;
      source += fields[1];
      originalLine += fields[2];
      originalColumn += fields[3];
      check(source >= 0 && source < originals.length, 'source index is out of range');
      check(originalLine >= 0 && originalLine < originals[source].length, 'original line is out of range');
      check(
        originalColumn >= 0 && originalColumn <= originals[source][originalLine].length,
        'original column is out of range'
      );
      if (fields.length === 5) {
        name += fields[4];
        check(name >= 0 && name < names.length, 'name index is out of range');
      }

      mapped += 1;
    }
  }

  check(mapped > 0, 'no mapped locations');

  return names;
}

function position(text, marker, filename) {
  const offset = text.indexOf(marker);

  assert.ok(offset >= 0, 'Source map location marker is missing: ' + filename);
  const prefix = lines(text.slice(0, offset));

  return { line: prefix.length - 1, column: prefix.at(-1).length };
}

export async function checkSourceMap(directory, filename, code) {
  const map = JSON.parse(await readFile(path.join(directory, 'dist', filename + '.map'), 'utf8'));

  assert.equal(map.version, 3);
  assert.ok(Array.isArray(map.sources) && map.sources.length > 0);
  assert.ok(Array.isArray(map.sourcesContent));
  assert.equal(map.sources.length, map.sourcesContent.length);
  const sources = new Map();
  const normalize = (value) => value.replace(/\r\n/g, '\n');

  for (let index = 0; index < map.sources.length; index++) {
    const source = path.resolve(directory, 'dist', map.sources[index]);

    assert.ok(
      source.startsWith(path.join(directory, 'src') + path.sep),
      'Source map escapes packaged source: ' + source
    );
    const content = await readFile(source, 'utf8');

    assert.equal(normalize(map.sourcesContent[index]), normalize(content), 'Source map content mismatch: ' + filename);
    sources.set(source, content);
  }

  const names = checkMappings(map, code, filename);
  const consumer = new SourceMap({ ...map, names });
  const owners = filename.endsWith('.js') ? Object.keys(guardMessages) : [filename];

  for (const owner of owners) {
    const marker = owner.endsWith('.mjs') ? './' + owner.replace(/\.mjs$/, '.cjs') : moduleMarkers[owner];

    assert.equal(typeof marker, 'string', 'Source map location probe is missing: ' + owner);
    const source = path.resolve(directory, 'src', owner);

    assert.ok(sources.has(source), 'Source map location source is missing: ' + owner);
    const generated = position(code, marker, filename);
    const expected = position(sources.get(source), marker, owner);
    const actual = consumer.findEntry(generated.line, generated.column);

    assert.ok(
      typeof actual.originalSource === 'string' &&
        path.resolve(directory, 'dist', actual.originalSource) === source &&
        actual.originalLine === expected.line,
      'Source map location mismatch: ' + filename + ' -> ' + owner
    );
  }
}
