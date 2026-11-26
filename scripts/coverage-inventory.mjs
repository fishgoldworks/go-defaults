/** Ensure every authored source module appears in Node's coverage table.
 * Node reports coverage for loaded modules only, so 100% totals alone
 * cannot detect a newly introduced, entirely untested source module.
 */
export function assertCoverageInventory(report, expectedFiles) {
  const start = report.lastIndexOf('# start of coverage report');
  const end = start < 0 ? -1 : report.indexOf('# end of coverage report', start);

  if (start < 0 || end < 0) throw new Error('Missing or malformed coverage report');

  const covered = new Set();
  const directories = [];

  for (const line of report.slice(start, end).split(/\r?\n/)) {
    const match = /^#( +)([^|]+?)\s+\|([^|]*)\|([^|]*)\|([^|]*)\|/.exec(line);

    if (!match) continue;
    const [, spaces, rawName] = match;
    const name = rawName.trim();
    const columns = match.slice(3).map((column) => column.trim());

    if (name === 'file' && columns.join('|') === 'line %|branch %|funcs %') continue;
    const directory = columns.every((column) => column === '');
    const measured = columns.every((column) => /^\d+(?:\.\d+)?$/.test(column) && Number(column) <= 100);

    if (!directory && !measured) continue;
    const depth = spaces.length;

    if (depth === 1 && name === 'all files' && measured) continue;
    while (directories.length && directories[directories.length - 1].depth >= depth) directories.pop();
    const fullName = [...directories.map((entry) => entry.name), name].join('/');

    if (directory) directories.push({ depth, name });
    else covered.add(fullName);
  }

  for (const source of expectedFiles) {
    if (!covered.has(source)) throw new Error('Missing source coverage entry: ' + source);
  }
}
