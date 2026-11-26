import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

export async function checkPackedArchive(filename, report, directory) {
  const invalid = (reason) => {
    throw new Error('Packed archive is invalid: ' + reason);
  };

  let tar;

  try {
    tar = gunzipSync(await readFile(filename));
  } catch (error) {
    throw new Error('Packed archive is not valid gzip: ' + filename, { cause: error });
  }

  if (tar.length < 1024 || tar.length % 512 !== 0) invalid('incomplete tar blocks');
  const files = new Map();
  const seen = new Set();
  let ended = false;

  for (let offset = 0; offset < tar.length;) {
    const header = tar.subarray(offset, offset + 512);

    if (header.every((byte) => byte === 0)) {
      if (tar.length - offset < 1024 || !tar.subarray(offset).every((byte) => byte === 0))
        invalid('invalid tar end blocks');
      ended = true;
      break;
    }

    const text = (start, length, allowSpacePadding = false) => {
      const field = header.subarray(start, start + length);
      const end = field.indexOf(0);

      // Hidden bytes after a path terminator can be interpreted differently by extractors.
      if (end >= 0 && field.subarray(end).some((byte) => byte !== 0 && (!allowSpacePadding || byte !== 32)))
        invalid('nonzero tar field padding');

      return field.subarray(0, end < 0 ? field.length : end).toString('utf8');
    };

    const number = (start, length, optional = false) => {
      const field = text(start, length, true).trim();

      if (optional && field === '') {
        return 0;
      }

      if (!/^[0-7]+$/.test(field)) invalid('invalid numeric tar header');
      const value = Number.parseInt(field, 8);

      if (!Number.isSafeInteger(value)) invalid('oversized tar header');

      return value;
    };

    let checksum = 0;

    for (let index = 0; index < 512; index++) checksum += index >= 148 && index < 156 ? 32 : header[index];
    if (checksum !== number(148, 8)) invalid('tar header checksum mismatch');
    // Fresh npm output uses USTAR files; do not silently interpret links or extended metadata.
    if (text(257, 6) !== 'ustar' || text(263, 2) !== '00') invalid('unsupported tar format');
    for (const [start, length] of [
      [100, 8],
      [108, 8],
      [116, 8],
      [136, 12]
    ])
      number(start, length, true);
    const size = number(124, 12);
    const data = offset + 512;
    const next = data + Math.ceil(size / 512) * 512;

    if (!Number.isSafeInteger(next) || next > tar.length) invalid('truncated tar entry');
    const prefix = text(345, 155);
    const name = (prefix ? prefix + '/' : '') + text(0, 100);
    const isDirectory = header[156] === 53;
    const canonical = isDirectory ? name.replace(/\/$/, '') : name;

    if (!isDirectory && header[156] !== 0 && header[156] !== 48) invalid('unsupported tar entry: ' + name);
    if (isDirectory && size !== 0) invalid('nonempty tar directory');
    if (
      (!canonical.startsWith('package/') && !(isDirectory && canonical === 'package')) ||
      canonical.includes('\\') ||
      canonical.split('/').some((part) => !part || part === '.' || part === '..')
    )
      invalid('invalid package path: ' + name);
    if (seen.has(canonical)) invalid('duplicate tar entry: ' + name);
    seen.add(canonical);
    if (!isDirectory) files.set(canonical.slice('package/'.length), tar.subarray(data, data + size));
    offset = next;
  }

  if (!ended) invalid('missing tar end blocks');
  if (!files.has('package.json')) invalid('missing package manifest');
  let manifest;

  try {
    manifest = JSON.parse(files.get('package.json').toString('utf8'));
  } catch (error) {
    throw new Error('Packed archive has an invalid package manifest', { cause: error });
  }

  const expectedManifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  const expectedFilename =
    expectedManifest.name.replace(/^@/, '').replace(/\//g, '-') + '-' + expectedManifest.version + '.tgz';

  if (
    !manifest ||
    manifest.name !== expectedManifest.name ||
    manifest.version !== expectedManifest.version ||
    report.name !== expectedManifest.name ||
    report.version !== expectedManifest.version ||
    report.filename !== expectedFilename
  )
    invalid('package identity mismatch');
  if (!Array.isArray(report.files) || report.files.some((entry) => typeof entry?.path !== 'string'))
    invalid('missing npm file inventory');
  const archived = [...files.keys()].sort();
  const reported = report.files.map((entry) => entry.path).sort();
  const same = (left, right) => left.length === right.length && left.every((name, index) => name === right[index]);

  if (!same(archived, reported)) invalid('inventory differs from npm report');
  const expected = [];

  for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
    if (entry.isDirectory()) continue;
    if (!entry.isFile()) invalid('unsupported built package entry: ' + entry.name);
    expected.push(path.relative(directory, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'));
  }

  if (!same(archived, expected.sort())) invalid('inventory differs from built package');
  for (const name of archived) {
    if (!files.get(name).equals(await readFile(path.join(directory, name))))
      invalid('file differs from built package: ' + name);
  }
}
