import { cp, copyFile, mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { run } from './process.mjs';
import { root, packageRoot } from './package-layout.mjs';

const require = createRequire(import.meta.url);
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
  console.log(version);
  try {
    // Test an isolated consumer of the built/installed package, never checkout resolution.
    await mkdir(path.join(temporary, 'node_modules'), { recursive: true });
    await cp(directory, path.join(temporary, 'node_modules/go-defaults'), { recursive: true });
    await writeFile(path.join(temporary, 'package.json'), JSON.stringify({ private: true }));
    for (const folder of ['types', 'consumers']) {
      const destination = path.join(temporary, 'test', folder);
      await mkdir(destination, { recursive: true });
      for (const entry of await readdir(path.join(root, 'test', folder), { withFileTypes: true })) {
        if (entry.isFile())
          await copyFile(path.join(root, 'test', folder, entry.name), path.join(destination, entry.name));
      }
    }
    const legacy = path.join(temporary, 'legacy');
    await mkdir(legacy);
    for (const entry of await readdir(path.join(root, 'test/types'), { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.cts')) {
        // Only the extension changes; the assertions are shared with modern consumers.
        await copyFile(
          path.join(root, 'test/types', entry.name),
          path.join(legacy, entry.name.replace(/\.cts$/, '.ts'))
        );
      }
    }
    await copyFile(path.join(root, 'test/consumers/default-import.cts'), path.join(legacy, 'default-import.ts'));
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
    process.stdout.write(run(process.execPath, ['emitted/legacy/default-import.js'], temporary));
    if (process.env.GO_DEFAULTS_NODE8)
      process.stdout.write(run(process.env.GO_DEFAULTS_NODE8, ['emitted/legacy/default-import.js'], temporary));
    console.log(
      'Legacy Node resolution: shared inference/rejection fixtures, ES5/ES2019 libraries and emitted CommonJS passed.'
    );
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
      compile([
        'test/consumers/default-import.mts',
        'test/consumers/default-import.cts',
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
      process.stdout.write(run(process.execPath, ['emitted/modern/default-import.cjs'], temporary));
      process.stdout.write(run(process.execPath, ['emitted/modern/default-import.mjs'], temporary));
      console.log(
        'Node16/NodeNext' +
          (bundler ? '/Bundler' : '') +
          ': shared fixtures, declarations and emitted CommonJS/ESM passed.'
      );
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
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
