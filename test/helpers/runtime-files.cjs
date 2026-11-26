const { readdirSync } = require('node:fs');
const path = require('node:path');

module.exports = function runtimeFiles(directory) {
  const tests = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.cjs'))
    .map((entry) => path.join(directory, entry.name))
    .sort();

  if (!tests.length) throw new Error('No Node contract tests found');

  return tests;
};
