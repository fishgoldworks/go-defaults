import { copyFile, cp, mkdir, mkdtemp, readdir, rm, readFile, writeFile, lstat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  root,
  packageRoot,
  runtimeFiles,
  names,
  consumerFiles,
  consumerManifest,
  temporaryDirectoryNames
} from './package-layout.mjs';
import { replaceDirectory } from './replace-directory.mjs';
import { checkArtifacts } from './test-artifacts.mjs';
import documentation from './docs.js';

function packageMismatch(message) {
  return new Error(message + '; run npm run build.');
}

async function compareGeneratedDirectory(staged, generated, label) {
  const [stagedEntries, generatedEntries] = await Promise.all(
    [staged, generated].map(async (directory) => {
      const entries = await readdir(directory, { withFileTypes: true });

      return new Map(entries.map((entry) => [entry.name, entry]));
    })
  );
  const names = [...new Set([...stagedEntries.keys(), ...generatedEntries.keys()])].sort();

  for (const name of names) {
    const expected = stagedEntries.get(name);
    const existing = generatedEntries.get(name);
    const file = label + '/' + name;

    if (!expected) throw packageMismatch('Unexpected generated path: ' + file);
    if (!existing) {
      const kind = expected.isDirectory() ? 'directory' : 'file';

      throw packageMismatch('Missing generated ' + kind + ': ' + file);
    }

    const stagedPath = path.join(staged, name);
    const generatedPath = path.join(generated, name);

    if (expected.isDirectory()) {
      if (!existing.isDirectory()) throw packageMismatch('Expected a directory at ' + file);
      await compareGeneratedDirectory(stagedPath, generatedPath, file);
    } else {
      if (!existing.isFile()) throw packageMismatch('Expected a regular file at ' + file);
      const [expectedBytes, existingBytes] = await Promise.all([readFile(stagedPath), readFile(generatedPath)]);

      if (!expectedBytes.equals(existingBytes)) throw packageMismatch('Stale generated file: ' + file);
    }
  }
}

async function checkPackageFreshness(staged) {
  const destination = await lstat(packageRoot).catch((error) => {
    if (error.code === 'ENOENT') throw packageMismatch('Missing generated directory: package/');
    throw error;
  });

  if (!destination.isDirectory()) throw packageMismatch('Expected a directory at package/');
  await compareGeneratedDirectory(staged, packageRoot, 'package');
}

export async function buildPackage({ untransformed = false, check = false } = {}) {
  const documents = documentation.generate(root, check);
  const build = untransformed ? undefined : (await import('esbuild')).build;
  const staged = await mkdtemp(path.join(check ? os.tmpdir() : root, '.go-defaults-build-'));
  let buildError;
  let buildFailed = false;

  try {
    await mkdir(path.join(staged, 'dist'));
    await cp(path.join(root, 'src'), path.join(staged, 'src'), {
      recursive: true,
      filter: async (source) =>
        !temporaryDirectoryNames.has(path.basename(source)) || !(await lstat(source)).isDirectory()
    });
    for (const filename of runtimeFiles) {
      const outfile = path.join(staged, 'dist', filename);

      if (untransformed) {
        const content = await readFile(path.join(staged, 'src', filename), 'utf8');
        const lines = content.replace(/\n$/, '').split('\n').length;

        await writeFile(outfile, content + '\n//# sourceMappingURL=' + filename + '.map\n');
        await writeFile(
          outfile + '.map',
          JSON.stringify({
            version: 3,
            sources: ['../src/' + filename],
            sourcesContent: [content],
            names: [],
            mappings: Array.from({ length: lines }, (_, index) => (index ? 'AACA' : 'AAAA')).join(';')
          }) + '\n'
        );
      } else
        await build({
          entryPoints: [path.join(staged, 'src', filename)],
          outfile,
          bundle: false,
          format: filename.endsWith('.cjs') ? 'cjs' : 'esm',
          legalComments: 'inline',
          platform: 'neutral',
          sourcemap: true,
          target: filename.endsWith('.cjs') ? 'node8.0' : 'node12.17'
        });
    }

    for (const entry of await readdir(path.join(root, 'types'), { withFileTypes: true })) {
      if (entry.isDirectory() && temporaryDirectoryNames.has(entry.name)) continue;
      await copyFile(path.join(root, 'types', entry.name), path.join(staged, 'dist', entry.name));
      if (entry.name.endsWith('.d.cts')) {
        // Derive the legacy declaration from the CommonJS owner; never maintain two signatures.
        const declaration = await readFile(path.join(root, 'types', entry.name), 'utf8');

        await writeFile(
          path.join(staged, 'dist', entry.name.replace(/\.d\.cts$/, '.d.ts')),
          declaration.replace(/(\.\/[\w-]+)\.cjs(['"])/g, '$1$2')
        );
      }
    }

    for (const name of names) {
      await writeFile(
        path.join(staged, name + '.js'),
        "'use strict';\nmodule.exports = require('./dist/" + name + ".cjs');\n"
      );
      // Adjacent declarations support helper imports without typesVersions,
      // which can override ESM export conditions in early NodeNext compilers.
      await writeFile(
        path.join(staged, name + '.d.ts'),
        "import helper = require('./dist/" + name + "');\nexport = helper;\n"
      );
    }

    for (const file of consumerFiles) {
      const destination = path.join(staged, file);

      await mkdir(path.dirname(destination), { recursive: true });
      if (Object.hasOwn(documents, file)) await writeFile(destination, documents[file]);
      else await copyFile(path.join(root, file), destination);
    }

    if (!untransformed) {
      const { buildBrowserBundles } = await import('./build-browser.mjs');

      await buildBrowserBundles(staged);
    }

    const manifest = consumerManifest({ browser: !untransformed });

    // The diagnostic source snapshot makes no transformed Node 8 compatibility claim.
    if (untransformed) manifest.engines.node = '>=22.16.0';
    await writeFile(path.join(staged, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
    await checkArtifacts(staged, { browser: !untransformed });
    if (check) await checkPackageFreshness(staged);
    else {
      await replaceDirectory(staged, packageRoot);
      console.log(
        'Built complete ' + (untransformed ? 'untransformed snapshot' : 'Node 8/CommonJS and native ESM package') + '.'
      );
    }
  } catch (error) {
    buildError = error;
    buildFailed = true;
  }

  try {
    await rm(staged, { recursive: true, force: true });
  } catch (error) {
    if (buildFailed)
      throw new AggregateError([buildError, error], 'Build failed and staging cleanup also failed: ' + staged, {
        cause: error
      });
    throw error;
  }

  if (buildFailed) throw buildError;
  if (check) console.log('Generated package is current.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);

  if (args.length && (args.length !== 1 || args[0] !== '--check'))
    throw new Error('Usage: node scripts/build.mjs [--check]');
  await buildPackage({ check: args.length === 1 });
}
