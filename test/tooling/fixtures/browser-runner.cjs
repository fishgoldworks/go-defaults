'use strict';

// Fault boundary only: use real Node test/esbuild/HTTP/CLI plumbing, while
// substituting browser transport failures. Actual browser validation runs separately.
const Module = require('node:module'),
  fs = require('node:fs');
const originalLoad = Module._load;
const mode = process.env.GO_DEFAULTS_BROWSER_FAULT;
const childProcess = require('node:child_process');
const { syncBuiltinESMExports } = require('node:module');
const { setTimeout: delay } = require('node:timers/promises');
let descendant;

async function startDescendant() {
  if (descendant) {
    return;
  }

  const file = process.env.GO_DEFAULTS_BROWSER_CHILD_PID_FILE;

  descendant = childProcess.spawn(
    process.execPath,
    ['-e', `require('node:fs').writeFileSync(${JSON.stringify(file)},String(process.pid));setInterval(()=>{},1000);`],
    { stdio: 'ignore', detached: process.platform !== 'win32', windowsHide: true }
  );
  while (!fs.existsSync(file)) await delay(10);
}

if (
  mode === 'zero-exit' &&
  process.env.NODE_TEST_CONTEXT &&
  process.argv.some((arg) => /browser\.test\.cjs$/.test(arg))
)
  process.exit(0);
const originalWrite = fs.writeFileSync;

fs.writeFileSync = function (file, data, ...rest) {
  if (String(file) === process.env.GO_DEFAULTS_BROWSER_COMPLETION_FILE) {
    if (mode === 'missing-completion') {
      return;
    }

    if (mode === 'incomplete-completion') {
      const record = JSON.parse(data);

      record.cases = [];
      data = JSON.stringify(record);
    }
  }

  return Reflect.apply(originalWrite, this, [file, data, ...rest]);
};

if (mode === 'kill-error' && process.argv.some((arg) => /test-browser\.mjs$/.test(arg))) {
  if (process.platform === 'win32') {
    const originalKill = childProcess.ChildProcess.prototype.kill;

    childProcess.ChildProcess.prototype.kill = function (...args) {
      Reflect.apply(originalKill, this, args);
      throw Error('CONTROLLED-TREE-CLEANUP-ERROR');
    };
  } else {
    const originalKill = process.kill;

    process.kill = function (...args) {
      const result = Reflect.apply(originalKill, this, args);

      if (args[0] < 0) throw Error('CONTROLLED-TREE-CLEANUP-ERROR');

      return result;
    };
  }
}

syncBuiltinESMExports();
const log = (engine, event) =>
  fs.appendFileSync(process.env.GO_DEFAULTS_BROWSER_EVENTS, JSON.stringify({ pid: process.pid, engine, event }) + '\n');

function engine(name) {
  return {
    async launch() {
      log(name, 'launch');
      if (mode === 'launch-error') throw Error('CONTROLLED-BROWSER-LAUNCH-FAILURE');

      return {
        version: () => 'simulated-lifecycle-boundary',
        async newPage() {
          log(name, 'newPage');

          return {
            async goto() {},
            async addScriptTag() {},
            async route() {},
            on() {},
            async evaluate(expression) {
              log(name, 'evaluate');
              if (['stall', 'stall-close', 'kill-error'].includes(mode) && mode !== 'stall-close') {
                return new Promise(() => {});
              }

              if (mode === 'stall-descendant' || mode === 'zero-exit-descendant') {
                await startDescendant();
                if (mode === 'zero-exit-descendant') process.exit(0);

                return new Promise(() => {});
              }

              if (mode === 'primary-error' || mode === 'combined-errors') {
                log(name, 'PRIMARY-BROWSER-CONTRACT');
                throw Error('PRIMARY-BROWSER-CONTRACT');
              }

              if (typeof expression === 'function') {
                return {
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
                };
              }

              if (expression === "withDefaults({ title: 'Home', visible: true }, { visible: false })") {
                return { title: 'Home', visible: false };
              }

              if (expression === "merge({ title: 'Home' }, { title: null })") {
                return { title: 'Home' };
              }

              if (expression === "defaultIf(title, 'Home')") {
                return 'Home';
              }

              if (expression.includes('goDefaults')) {
                return true;
              }

              throw Error('Unknown simulated evaluation: ' + expression);
            },
            async close() {
              log(name, 'page.close');
              if (mode === 'stall-close') {
                return new Promise(() => {});
              }

              if (mode === 'zero-exit-cleanup') process.exit(0);
              if (mode === 'cleanup-error' || mode === 'combined-errors') throw Error('SECONDARY-PAGE-CLEANUP');
            }
          };
        },
        async close() {
          log(name, 'browser.close');
          if (mode === 'combined-errors') throw Error('TERTIARY-BROWSER-CLEANUP');
        }
      };
    }
  };
}

Module._load = function (request, parent, isMain) {
  if (request === 'playwright') {
    return { chromium: engine('chromium'), firefox: engine('firefox'), webkit: engine('webkit') };
  }

  return Reflect.apply(originalLoad, this, [request, parent, isMain]);
};
