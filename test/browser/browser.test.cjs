const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { before, after, test } = require('node:test');
const { build } = require('esbuild');
const { chromium, firefox, webkit } = require('playwright');
const checkBrowserContract = require('./browser-contract.cjs');
const directory = process.env.GO_DEFAULTS_BROWSER_PACKAGE || path.resolve(__dirname, '../../package');
const filenames = ['go-defaults.js', 'go-defaults.min.js'];
const completedEngines = [];
const completedCases = [];
let server;
let address;
let exampleBundleUrl;

async function withCleanup(action, cleanup) {
  let failure;

  try {
    await action();
  } catch (error) {
    failure = { error };
  }

  try {
    await cleanup();
  } catch (error) {
    if (failure) {
      const errors = [failure.error, error];

      // Node 22's TAP reporter omits AggregateError.errors; retain the original
      // stack in diagnostics as well as keeping the exact thrown values.
      try {
        console.error('Original browser failure:', failure.error);
        console.error('Browser cleanup failure:', error);
      } catch (diagnosticError) {
        errors.push(diagnosticError);
      }

      throw new AggregateError(errors, 'Browser operation and resource cleanup failed.', {
        cause: error
      });
    }

    throw error;
  }

  if (failure) throw failure.error;
}

async function checkPage(browser, engine, label, action) {
  const page = await browser.newPage();

  await withCleanup(
    () => action(page),
    () => page.close()
  );
  completedCases.push(engine + '/' + label);
}

async function assertDocumentAllHandling(page) {
  const result = await page.evaluate(() => {
    const api = globalThis.goDefaults;
    let laterReads = 0;
    const later = {
      get value() {
        laterReads++;

        return 7;
      }
    };
    const operations = {
      initialLayer: () => api.withDefaults(document.all),
      overrideLayer: () => api.withDefaults({}, document.all),
      reusableOverride: () => api.createDefaultsMerger()({}, document.all),
      factoryDefaults: () => api.createDefaultsMerger()(document.all),
      beforeLaterGetter: () => api.withDefaults({}, document.all, later),
      reusableBeforeLaterGetter: () => api.createDefaultsMerger()({}, document.all, later)
    };
    const rejected = {};

    for (const [name, invoke] of Object.entries(operations)) {
      let failure;

      try {
        invoke();
      } catch (error) {
        failure = error;
      }

      rejected[name] = failure instanceof TypeError;
    }

    const failure = new Error('earlier getter');
    let propagated;

    try {
      api.withDefaults(
        {
          get value() {
            throw failure;
          }
        },
        document.all
      );
    } catch (error) {
      propagated = error;
    }

    return {
      propertyValue: api.withDefaults({ value: 'fallback' }, { value: document.all }).value === document.all,
      selectedValue: api.defaultIf(document.all, 'fallback') === document.all,
      nullishLayers: api.withDefaults(null, undefined, { value: 7 }, null, undefined).value === 7,
      rejected,
      laterReads,
      earlierGetterError: propagated === failure
    };
  });

  assert.deepEqual(result, {
    propertyValue: true,
    selectedValue: true,
    nullishLayers: true,
    rejected: {
      initialLayer: true,
      overrideLayer: true,
      reusableOverride: true,
      factoryDefaults: true,
      beforeLaterGetter: true,
      reusableBeforeLaterGetter: true
    },
    laterReads: 0,
    earlierGetterError: true
  });
}

before(async () => {
  const readme = fs.readFileSync(path.join(directory, 'README.md'), 'utf8');
  const example = /```html\r?\n([\s\S]*?)```/.exec(readme);

  assert.ok(example, 'The packaged README must provide a runnable script-tag example');
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));

  exampleBundleUrl = 'https://cdn.jsdelivr.net/npm/go-defaults@' + metadata.version + '/dist/go-defaults.min.js';
  const sources = [...example[1].matchAll(/<script src="([^"]+)"><\/script>/g)].map((match) => match[1]);

  assert.equal(sources.length, 1, 'The README example loads one browser bundle');
  assert.ok(
    [exampleBundleUrl, './dist/go-defaults.min.js'].includes(sources[0]),
    'The README example must use this package version or its local bundle'
  );
  const scripts = new Map(
    filenames.map((name) => ['/dist/' + name, fs.readFileSync(path.join(directory, 'dist', name))])
  );
  const consumer = await build({
    stdin: {
      contents: `import Defaults from 'go-defaults';
import createDefaultsMerger from 'go-defaults/createDefaultsMerger';
import defaultIf from 'go-defaults/defaultIf';
import { withDefaults } from 'go-defaults/withDefaults';
if (Defaults.createDefaultsMerger !== createDefaultsMerger || Defaults.defaultIf !== defaultIf || Defaults.withDefaults !== withDefaults) {
  throw new Error('Root and focused imports must share their implementations.');
}
globalThis.goDefaults = Defaults;`,
      resolveDir: directory,
      sourcefile: 'browser-consumer.mjs'
    },
    bundle: true,
    platform: 'browser',
    target: 'es2017',
    format: 'iife',
    minify: true,
    write: false
  });

  scripts.set('/consumer.min.js', consumer.outputFiles[0].text);

  server = http.createServer((request, response) => {
    if (scripts.has(request.url)) {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(scripts.get(request.url));
    } else if (request.url === '/example') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><html><body>' + example[1] + '</body></html>');
    } else if (request.url === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><html><body></body></html>');
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  address = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  if (process.env.GO_DEFAULTS_BROWSER_COMPLETION_FILE) {
    fs.writeFileSync(
      process.env.GO_DEFAULTS_BROWSER_COMPLETION_FILE,
      JSON.stringify({
        token: process.env.GO_DEFAULTS_BROWSER_COMPLETION_TOKEN,
        engines: completedEngines,
        cases: completedCases
      })
    );
  }
});

for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  test(name + ': browser bundles, minified consumer and README example', async (t) => {
    const browser = await engine.launch();

    await withCleanup(
      async () => {
        t.diagnostic(name + ' ' + browser.version());
        for (const filename of filenames) {
          await t.test(filename, async () => {
            await checkPage(browser, name, filename, async (page) => {
              await page.goto(address);
              await page.addScriptTag({ url: address + '/dist/' + filename });
              assert.equal(await page.evaluate('(' + checkBrowserContract.toString() + ')(goDefaults)'), true);
              await assertDocumentAllHandling(page);
            });
          });
        }

        await t.test('minified application consumer preserves input validation', async () => {
          await checkPage(browser, name, 'minified application consumer preserves input validation', async (page) => {
            await page.goto(address);
            await page.addScriptTag({ url: address + '/consumer.min.js' });
            assert.equal(await page.evaluate('(' + checkBrowserContract.toString() + ')(goDefaults)'), true);
            await assertDocumentAllHandling(page);
          });
        });

        await t.test('documented script-tag example', async () => {
          await checkPage(browser, name, 'documented script-tag example', async (page) => {
            const errors = [];

            // Test the supplied package before publication without depending on CDN availability.
            await page.route(exampleBundleUrl, (route) =>
              route.fulfill({
                path: path.join(directory, 'dist', 'go-defaults.min.js'),
                contentType: 'text/javascript'
              })
            );
            page.on('pageerror', (error) => errors.push(error.message));
            await page.goto(address + '/example');
            assert.deepEqual(errors, []);
            assert.deepEqual(
              await page.evaluate("withDefaults({ title: 'Home', visible: true }, { visible: false })"),
              { title: 'Home', visible: false }
            );
            assert.deepEqual(await page.evaluate("merge({ title: 'Home' }, { title: null })"), { title: 'Home' });
            assert.equal(await page.evaluate("defaultIf(title, 'Home')"), 'Home');
          });
        });
      },
      () => browser.close()
    );
    completedEngines.push(name);
  });
}
