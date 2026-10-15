const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { before, after, test } = require('node:test');
const { chromium, firefox, webkit } = require('playwright');
const checkBrowserContract = require('./browser-contract.cjs');
const directory = process.env.GO_DEFAULTS_BROWSER_PACKAGE || path.resolve(__dirname, '../../package');
const filenames = ['go-defaults.js', 'go-defaults.min.js'];
let server;
let address;
before(async () => {
  const readme = fs.readFileSync(path.join(directory, 'README.md'), 'utf8');
  const example = /```html\r?\n([\s\S]*?)```/.exec(readme);
  assert.ok(example, 'The packaged README must provide a runnable script-tag example');
  const scripts = new Map(
    filenames.map((name) => ['/dist/' + name, fs.readFileSync(path.join(directory, 'dist', name))])
  );
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
});

for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  test(name + ': browser bundles and README example', async (t) => {
    const browser = await engine.launch();
    t.diagnostic(name + ' ' + browser.version());
    try {
      for (const filename of filenames) {
        await t.test(filename, async () => {
          const page = await browser.newPage();
          try {
            await page.goto(address);
            await page.addScriptTag({ url: address + '/dist/' + filename });
            assert.equal(await page.evaluate('(' + checkBrowserContract.toString() + ')(goDefaults)'), true);
            // document.all behaves like undefined in loose comparisons; it is an explicit property value here.
            assert.equal(
              await page.evaluate(
                () =>
                  globalThis.goDefaults.withDefaults({ value: 'fallback' }, { value: document.all }).value ===
                  document.all
              ),
              true
            );
          } finally {
            await page.close();
          }
        });
      }
      await t.test('documented script-tag example', async () => {
        const page = await browser.newPage();
        try {
          const errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          await page.goto(address + '/example');
          assert.deepEqual(errors, []);
          assert.deepEqual(await page.evaluate('result'), { title: 'Home', visible: false });
          assert.deepEqual(await page.evaluate("applyDefaults({ title: 'About' })"), { title: 'About', visible: true });
        } finally {
          await page.close();
        }
      });
    } finally {
      await browser.close();
    }
  });
}
