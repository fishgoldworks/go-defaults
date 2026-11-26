import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ESLint } from 'eslint';
import { readabilityFixRuleIds } from './readability.mjs';

const require = createRequire(import.meta.url);

export async function formatProject(directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')) {
  const cwd = fs.realpathSync(directory);
  const packagePath = require.resolve('prettier/package.json');
  const metadata = require(packagePath);
  const prettier = path.resolve(path.dirname(packagePath), metadata.bin.prettier || metadata.bin);
  const runPrettier = (mode) => {
    const result = spawnSync(process.execPath, [prettier, '.', mode], { cwd, stdio: 'inherit' });

    if (result.error) {
      throw result.error;
    }

    return result.status === null ? 1 : result.status;
  };

  const formatted = runPrettier('--write');

  if (formatted !== 0) {
    return formatted;
  }

  // A suggestion-classified JSDoc fixer is allowed; unrelated fixes are not.
  const eslint = new ESLint({
    cwd,
    cache: false,
    concurrency: 'off',
    fix: (message) => readabilityFixRuleIds.includes(message.ruleId)
  });
  const results = await eslint.lintFiles(['.']);

  await ESLint.outputFixes(results);

  const formatter = await eslint.loadFormatter('stylish');
  const diagnostics = await formatter.format(results);

  if (diagnostics) {
    process.stdout.write(diagnostics);
  }

  const failed = results.some((result) => result.errorCount || result.warningCount);

  // Run the read-only conflict check even when unrelated lint errors remain.
  const checked = runPrettier('--check');

  return checked !== 0 ? checked : failed ? 1 : 0;
}

function isDirectExecution() {
  if (!process.argv[1]) {
    return false;
  }

  try {
    return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1]);
  } catch (error) {
    // Stdin and embedded hosts may supply a non-file main entry.
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      return false;
    }

    throw error;
  }
}

if (isDirectExecution()) {
  try {
    if (process.argv.length > 2) {
      throw new Error('The formatting command accepts no arguments.');
    }

    process.exitCode = await formatProject();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
