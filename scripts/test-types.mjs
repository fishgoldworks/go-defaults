import { cp, copyFile, mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { run } from './process.mjs';
import { runConsumerCheck } from './consumer-check.mjs';
import { root, packageRoot } from './package-layout.mjs';

const require = createRequire(import.meta.url);

async function checkEmittedConsumer(directory, file, executable = process.execPath) {
  const esm = file.endsWith('.mjs');
  const bootstrap = path.join(directory, 'check-emitted.' + (esm ? 'mjs' : 'cjs'));
  const kind = 'types:' + file;

  // Keep compiler output intact and confirm completion only after module execution.
  await writeFile(
    bootstrap,
    [
      esm ? 'import fs from "fs"; import { pathToFileURL } from "url";' : 'var fs = require("fs");',
      'var file = process.argv[2], kind = process.argv[3];',
      'process.argv.splice(1, 3, file);',
      esm ? 'await import(pathToFileURL(file).href);' : 'require(file);',
      'fs.writeFileSync(process.env.GO_DEFAULTS_CONSUMER_COMPLETION_FILE, JSON.stringify({',
      '  token: process.env.GO_DEFAULTS_CONSUMER_COMPLETION_TOKEN, kind: kind, node: process.version',
      '}));'
    ].join('\n')
  );
  process.stdout.write(
    await runConsumerCheck(executable, [bootstrap, path.join(directory, file), kind], directory, kind)
  );
}

export async function checkTypes({
  compiler = require.resolve('typescript/lib/tsc.js'),
  directory = packageRoot
} = {}) {
  const version = run(process.execPath, [compiler, '--version'], root).trim();
  const match = /^Version (\d+)\.(\d+)\.(\d+)/.exec(version);

  if (!match) throw new Error('Unrecognised TypeScript compiler version: ' + version);
  const [, majorText, minorText] = match;
  const major = Number(majorText);
  const minor = Number(minorText);
  const modernModules = major > 4 || (major === 4 && minor >= 7);
  const bundler = major >= 5;
  const legacyDeprecations = major >= 6 ? ['--ignoreDeprecations', '6.0'] : [];
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'go-defaults-types-'));
  let failure;

  console.log(version);
  try {
    // Test an isolated consumer of the built/installed package, never checkout resolution.
    await mkdir(path.join(temporary, 'node_modules'), { recursive: true });
    await cp(directory, path.join(temporary, 'node_modules/go-defaults'), { recursive: true });
    await writeFile(path.join(temporary, 'package.json'), JSON.stringify({ private: true }));
    const fixtures = path.join(root, 'test/types');
    const destination = path.join(temporary, 'test/types');

    await mkdir(destination, { recursive: true });
    const entries = await readdir(fixtures, { withFileTypes: true });

    for (const entry of entries)
      if (entry.isFile()) await copyFile(path.join(fixtures, entry.name), path.join(destination, entry.name));

    const legacy = path.join(temporary, 'legacy');

    await mkdir(legacy);
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.cts')) {
        // Only the extension changes; the assertions are shared with modern consumers.
        await copyFile(path.join(fixtures, entry.name), path.join(legacy, entry.name.replace(/\.cts$/, '.ts')));
      }
    }

    const strictDirectory = path.join(temporary, 'strict');

    await mkdir(strictDirectory);
    for (const extension of ['cts', 'mts'])
      await copyFile(
        path.join(fixtures, 'strict', 'consumer.' + extension),
        path.join(strictDirectory, 'consumer.' + extension)
      );
    await copyFile(path.join(strictDirectory, 'consumer.cts'), path.join(strictDirectory, 'consumer.ts'));

    await writeFile(
      path.join(temporary, 'legacy.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          types: [],
          target: 'ES2015',
          lib: ['ES2021'],
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true
        },
        include: ['legacy/*.ts']
      })
    );
    const compile = (args) => process.stdout.write(run(process.execPath, [compiler, ...args], temporary));
    // Verbatim mode includes isolated-module checking; TS5.0 rejects both flags together.
    const strictOptions = ['--noUncheckedIndexedAccess', major >= 5 ? '--verbatimModuleSyntax' : '--isolatedModules'];

    for (const exact of ['true', 'false']) {
      compile(['-p', 'legacy.json', '--exactOptionalPropertyTypes', exact, ...legacyDeprecations]);
    }

    // Older ambient libraries must suffice to import and use ordinary record defaults.
    for (const lib of ['ES5', 'ES2019']) {
      compile([
        'legacy/merge-compat.ts',
        '--strict',
        '--noEmit',
        '--target',
        'ES2015',
        '--lib',
        lib,
        '--module',
        'commonjs',
        '--moduleResolution',
        'node',
        ...legacyDeprecations
      ]);
    }

    compile([
      'legacy/default-import.ts',
      '--strict',
      '--target',
      'ES2015',
      '--module',
      'commonjs',
      '--moduleResolution',
      'node',
      '--esModuleInterop',
      '--outDir',
      'emitted/legacy',
      ...legacyDeprecations
    ]);
    compile([
      'legacy/default-import.ts',
      '--strict',
      '--noEmit',
      '--target',
      'ES2015',
      '--module',
      'ESNext',
      '--moduleResolution',
      'node',
      '--allowSyntheticDefaultImports',
      ...legacyDeprecations
    ]);
    await checkEmittedConsumer(temporary, 'emitted/legacy/default-import.js');
    if (process.env.GO_DEFAULTS_NODE8)
      await checkEmittedConsumer(temporary, 'emitted/legacy/default-import.js', process.env.GO_DEFAULTS_NODE8);
    console.log(
      'Legacy Node resolution: shared inference/rejection fixtures, ES5/ES2019 libraries and emitted CommonJS passed.'
    );

    for (const exact of ['true', 'false'])
      compile([
        'strict/consumer.ts',
        '--strict',
        '--noEmit',
        '--skipLibCheck',
        'false',
        '--target',
        'ES2015',
        '--module',
        'commonjs',
        '--moduleResolution',
        'node',
        '--exactOptionalPropertyTypes',
        exact,
        ...strictOptions,
        ...legacyDeprecations
      ]);
    if (modernModules) {
      const configurations = ['tsconfig.json', 'tsconfig.no-dom.json', 'tsconfig.dom.json'];

      if (bundler) configurations.push('tsconfig.bundler.json');
      for (const config of configurations) {
        for (const exact of ['true', 'false'])
          compile(['-p', 'test/types/' + config, '--exactOptionalPropertyTypes', exact]);
      }

      for (const exact of ['true', 'false'])
        compile([
          '-p',
          'test/types/tsconfig.json',
          '--module',
          'Node16',
          '--moduleResolution',
          'Node16',
          '--exactOptionalPropertyTypes',
          exact
        ]);
      for (const config of ['tsconfig.compat-es5.json', 'tsconfig.compat-es2019.json'])
        compile(['-p', 'test/types/' + config]);
      for (const exact of ['true', 'false'])
        compile([
          'strict/consumer.cts',
          'strict/consumer.mts',
          '--strict',
          '--noEmit',
          '--skipLibCheck',
          'false',
          '--target',
          'ES2020',
          '--module',
          'NodeNext',
          '--moduleResolution',
          'NodeNext',
          '--exactOptionalPropertyTypes',
          exact,
          ...strictOptions
        ]);
      if (bundler)
        compile([
          'strict/consumer.mts',
          '--strict',
          '--noEmit',
          '--skipLibCheck',
          'false',
          '--target',
          'ES2020',
          '--module',
          'ESNext',
          '--moduleResolution',
          'Bundler',
          '--exactOptionalPropertyTypes',
          'true',
          ...strictOptions
        ]);
      compile([
        'test/types/default-import.mts',
        'test/types/default-import.cts',
        '--strict',
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        '--target',
        'ES2020',
        '--outDir',
        'emitted/modern'
      ]);
      await checkEmittedConsumer(temporary, 'emitted/modern/default-import.cjs');
      await checkEmittedConsumer(temporary, 'emitted/modern/default-import.mjs');
      console.log(
        'Node16/NodeNext' +
          (bundler ? '/Bundler' : '') +
          ': shared fixtures, declarations and emitted CommonJS/ESM passed.'
      );
    }

    console.log(
      'Stricter consumers passed: noUncheckedIndexedAccess, ' +
        (major >= 5 ? 'verbatimModuleSyntax (including isolated module checks).' : 'isolatedModules.')
    );
  } catch (error) {
    failure = { error };
  }

  try {
    await rm(temporary, { recursive: true, force: true });
  } catch (cleanupError) {
    if (failure)
      throw new AggregateError(
        [failure.error, cleanupError],
        'TypeScript verification and project cleanup failed: ' + temporary,
        { cause: cleanupError }
      );
    throw cleanupError;
  }

  if (failure) throw failure.error;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const options = {};
  const args = process.argv.slice(2);

  while (args.length) {
    const option = args.shift();

    if (!['--compiler', '--package'].includes(option) || !args.length)
      throw new Error(
        'Usage: npm run test:types -- [--compiler path/to/tsc.js] [--package built-or-installed-package]'
      );
    options[option === '--compiler' ? 'compiler' : 'directory'] = path.resolve(args.shift());
  }

  await checkTypes(options);
}
