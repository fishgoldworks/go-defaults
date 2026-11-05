import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, packageRoot } from './package-layout.mjs';
import { run } from './process.mjs';

export function checkBrowser(directory = packageRoot) {
  process.stdout.write(
    run(process.execPath, ['--test', 'test/consumers/browser.test.cjs'], root, {
      ...process.env,
      GO_DEFAULTS_BROWSER_PACKAGE: path.resolve(directory)
    })
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--package'))
    throw new Error('Usage: npm run test:browser -- [--package <installed-package-directory>]');
  checkBrowser(args.length ? args[1] : packageRoot);
}
