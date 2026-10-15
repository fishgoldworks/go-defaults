import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { minify } from 'terser';
import { metadata, browserBundles } from './package-layout.mjs';

export async function buildBrowserBundles(directory) {
  const license = (await readFile(path.join(directory, 'LICENSE.md'), 'utf8')).replace(/\r\n/g, '\n').trim();
  const notice = `/*! ${metadata.name} v${metadata.version}\n\n${license}\n*/`;
  const wrapper = `(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.goDefaults = factory();
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {
  var module = { exports: {} };
  var exports = module.exports;`;
  const readable = path.join(directory, 'dist', browserBundles[0]);
  await build({
    entryPoints: [path.join(directory, 'src/index.cjs')],
    outfile: readable,
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: 'es2017',
    keepNames: true,
    sourcemap: true,
    legalComments: 'inline',
    banner: { js: notice + '\n' + wrapper },
    footer: { js: 'return module.exports;\n});' }
  });
  const minified = await minify(
    { [browserBundles[0]]: await readFile(readable, 'utf8') },
    {
      ecma: 2017,
      compress: { comparisons: false, typeofs: false, pure_getters: false },
      mangle: { properties: false },
      keep_fnames: true,
      keep_classnames: true,
      format: { comments: false, preamble: notice },
      sourceMap: {
        content: await readFile(readable + '.map', 'utf8'),
        filename: browserBundles[1],
        url: browserBundles[1] + '.map',
        includeSources: true
      }
    }
  );
  if (typeof minified.code !== 'string' || typeof minified.map !== 'string')
    throw new Error('Browser minification did not produce code and a source map');
  await writeFile(path.join(directory, 'dist', browserBundles[1]), minified.code + '\n');
  await writeFile(path.join(directory, 'dist', browserBundles[1] + '.map'), minified.map + '\n');
}
