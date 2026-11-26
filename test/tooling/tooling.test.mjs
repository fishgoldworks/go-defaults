import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ESLint } from 'eslint';
import { packageRoot, root } from '../../scripts/package-layout.mjs';
import { runtimeRunnerFixture as runnerFixture } from '../helpers/runtime-runner-fixture.mjs';

test('conditional returns require braces in JS and TS without restricting other conditional bodies', async () => {
  const eslint = new ESLint({ cwd: root });
  const rejected = [
    'if (flag) return 1;\n\nreturn 0;',
    'if (flag) { return 1; } else return 0;',
    'if (flag)\n  return;\n\nreturn 0;'
  ];
  const allowed = [
    'if (flag) {\n  return 1;\n}\n\nreturn 0;',
    'if (flag) { return 1; } else { return 0; }',
    'if (flag) flag = false;\n\nreturn flag;',
    'if (flag) throw new Error("flag");\n\nreturn 0;'
  ];

  for (const extension of ['js', 'cjs', 'mjs', 'ts', 'cts', 'mts']) {
    const filePath = /^(ts|cts|mts)$/.test(extension)
      ? 'test/types/return-control.' + extension
      : 'test/tooling/return-control.' + extension;
    const lint = async (body) => {
      const [result] = await eslint.lintText('function guard(flag) {\n' + body + '\n}\n\nguard(true);\n', { filePath });

      return result.messages;
    };

    for (const body of rejected) {
      const messages = await lint(body);

      assert.equal(messages.length, 1, filePath + ': ' + body);
      assert.equal(messages[0].ruleId, 'no-restricted-syntax', filePath);
      assert.match(messages[0].message, /conditional returns.*braced/i);
    }

    for (const body of allowed) assert.deepEqual(await lint(body), [], filePath + ': ' + body);
  }
});

test('CI uses read-only permissions, disposable credentials and pinned actions', async () => {
  const ci = await fs.readFile(path.join(root, '.github/workflows/ci.yml'), 'utf8');

  assert.match(ci, /^permissions:[ \t]*\r?\n[ \t]+contents:[ \t]*read[ \t]*$/m);
  assert.doesNotMatch(ci, /\b(pull_request_target|workflow_run)\b/);
  assert.doesNotMatch(ci, /^[ \t]*[\w-]+:[ \t]*(?:write|write-all)[ \t]*$/m);
  for (const match of ci.matchAll(/^[ \t]*- uses: (\S+)/gm)) {
    const action = match[1];

    if (action.startsWith('./')) continue;
    assert.match(action, /^[^@]+@[0-9a-f]{40}$/i, 'External action must use a full commit SHA');
    if (action.startsWith('actions/checkout@')) {
      const following = ci.slice(match.index + match[0].length);
      const nextStep = following.search(/^[ \t]*- (?:uses|run|name|if): /m);
      const ownStep = nextStep === -1 ? following : following.slice(0, nextStep);

      assert.match(ownStep, /^[ \t]+persist-credentials:[ \t]*false[ \t]*$/m);
    }
  }
});

async function temporary(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'go-defaults-recovery-'));

  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  return directory;
}

test('benchmark accepts a package directory beside package.json and a direct entry file', async (t) => {
  const directory = await temporary(t);
  const result = spawnSync(
    process.execPath,
    [
      'scripts/benchmark.mjs',
      '--baseline',
      packageRoot,
      '--candidate',
      path.join(packageRoot, 'dist/index.cjs'),
      '--rounds',
      '5',
      '--sample-ms',
      '5',
      '--out',
      path.join(directory, 'result.json')
    ],
    { cwd: root, encoding: 'utf8' }
  );

  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(await fs.readFile(path.join(directory, 'result.json'), 'utf8'));

  assert.equal(report.paths.baseline, packageRoot);
  assert.ok(report.results.length > 0);
  assert.ok(report.results.every((result) => result.samples.length === 5));
});

async function benchmarkFixture(t) {
  const directory = await temporary(t);

  for (const name of ['scripts', 'benchmarks', 'deps']) await fs.mkdir(path.join(directory, name));
  for (const name of ['scripts/benchmark.mjs', 'benchmarks/cases.mjs']) {
    await fs.copyFile(path.join(root, name), path.join(directory, name));
  }

  const marker = path.join(directory, 'calls.txt');
  const api = JSON.stringify(path.join(packageRoot, 'dist/index.cjs'));
  const source = `const fs=require('node:fs'),api=require(${api});let called=false;
exports.withDefaults=function(){if(!called){called=true;fs.writeFileSync(${JSON.stringify(marker)},'called');}return Reflect.apply(api.withDefaults,this,arguments);};
exports.createDefaultsMerger=api.createDefaultsMerger;\n`;

  await fs.writeFile(path.join(directory, 'deps/api.cjs'), source);
  await fs.writeFile(path.join(directory, 'entry.cjs'), "module.exports=require('./deps/api.cjs');\n");
  await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ main: './entry.cjs' }));
  await fs.writeFile(
    path.join(directory, 'clock.mjs'),
    "import {performance} from 'node:perf_hooks';let now=0;Object.defineProperty(performance,'now',{value:()=>now+=10});\n"
  );

  return { directory, marker, api, source };
}

function runBenchmark(fixture, options = {}) {
  const args = [
    '--import',
    pathToFileURL(path.join(fixture.directory, 'clock.mjs')).href,
    path.join(fixture.directory, 'scripts/benchmark.mjs'),
    '--baseline',
    options.baseline || fixture.directory,
    '--candidate',
    options.candidate || fixture.directory,
    '--rounds',
    '5',
    '--sample-ms',
    '5',
    ...(options.out ? ['--out', options.out] : [])
  ];

  return spawnSync(process.execPath, args, { cwd: fixture.directory, encoding: 'utf8', timeout: 30000 });
}

test('benchmark rejects report paths that overwrite loaded inputs before timing', async (t) => {
  const targets = [
    'baseline',
    'candidate',
    'dependency',
    'manifest',
    'redirect manifest',
    'dependency manifest',
    'imports manifest',
    'imports pattern manifest',
    'driver',
    'workload',
    'workload dependency',
    'ESM dependency',
    'hard link',
    'directory alias'
  ];

  if (process.platform === 'win32') targets.push('case alias');
  for (const target of targets) {
    await t.test(target, async (t) => {
      const fixture = await benchmarkFixture(t);
      const entry = path.join(fixture.directory, 'entry.cjs');
      let input = entry,
        output = entry;
      const options = {};

      if (target === 'baseline') options.candidate = packageRoot;
      else if (target === 'candidate') options.baseline = packageRoot;
      else if (target === 'dependency') input = output = path.join(fixture.directory, 'deps/api.cjs');
      else if (target === 'manifest') input = output = path.join(fixture.directory, 'package.json');
      else if (target === 'redirect manifest') {
        const redirect = path.join(fixture.directory, 'redirect');

        await fs.mkdir(redirect);
        input = output = path.join(redirect, 'package.json');
        await fs.writeFile(input, '{"main":"../entry.cjs"}');
        options.candidate = redirect;
      } else if (['dependency manifest', 'imports manifest', 'imports pattern manifest'].includes(target)) {
        const dependency = path.join(
          fixture.directory,
          'node_modules',
          target === 'imports pattern manifest' ? 'example-branch' : 'example'
        );
        const nested = target === 'dependency manifest';
        const selected = nested ? path.join(dependency, 'branch') : dependency;

        await fs.mkdir(selected, { recursive: true });
        input = output = path.join(selected, 'package.json');
        await fs.writeFile(input, JSON.stringify({ main: nested ? '../../../deps/api.cjs' : '../../deps/api.cjs' }));
        if (target !== 'dependency manifest') {
          const imports =
            target === 'imports manifest'
              ? { '#api': 'example' }
              : { '#api/*': { node: 'example-*', default: 'not-loaded-*' } };

          await fs.writeFile(
            path.join(fixture.directory, 'package.json'),
            JSON.stringify({ main: './entry.cjs', imports })
          );
        }

        const request =
          target === 'dependency manifest' ? 'example/branch' : target === 'imports manifest' ? '#api' : '#api/branch';

        await fs.writeFile(entry, `module.exports=require(${JSON.stringify(request)});\n`);
      } else if (target === 'driver') input = output = path.join(fixture.directory, 'scripts/benchmark.mjs');
      else if (target === 'workload') input = output = path.join(fixture.directory, 'benchmarks/cases.mjs');
      else if (target === 'workload dependency') {
        const cases = path.join(fixture.directory, 'benchmarks/cases.mjs');

        input = output = path.join(fixture.directory, 'benchmarks/data.mjs');
        await fs.writeFile(input, 'export const example = 1;\n');
        await fs.writeFile(cases, "import './data.mjs';\n" + (await fs.readFile(cases, 'utf8')));
      } else if (target === 'ESM dependency') {
        input = output = path.join(fixture.directory, 'deps/api.mjs');
        await fs.writeFile(
          input,
          `import api from ${JSON.stringify(pathToFileURL(path.join(packageRoot, 'dist/index.cjs')).href)};export const withDefaults=api.withDefaults,createDefaultsMerger=api.createDefaultsMerger;\n`
        );
        await fs.writeFile(entry, "module.exports=require('./deps/api.mjs');\n");
      } else if (target === 'hard link') {
        output = path.join(fixture.directory, 'report.json');
        await fs.link(entry, output);
      } else if (target === 'directory alias') {
        const alias = path.join(fixture.directory, 'alias');

        await fs.symlink(
          path.join(fixture.directory, 'deps'),
          alias,
          process.platform === 'win32' ? 'junction' : 'dir'
        );
        input = path.join(fixture.directory, 'deps/api.cjs');
        output = path.join(alias, 'api.cjs');
      } else if (target === 'case alias') output = entry.toUpperCase();

      const before = await fs.readFile(input);
      const result = runBenchmark(fixture, { ...options, out: output });

      assert.notEqual(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stderr, /report would overwrite an input/i);
      assert.doesNotMatch(result.stdout, /merge:/);
      assert.deepEqual(await fs.readFile(input), before);
      assert.equal(await fs.stat(fixture.marker).catch(() => null), null);
    });
  }
});

test('benchmark rechecks inputs loaded lazily before writing a report', async (t) => {
  const fixture = await benchmarkFixture(t);
  const late = path.join(fixture.directory, 'deps/late.cjs');
  const before = "module.exports='loaded during a benchmark operation';\n";

  await fs.writeFile(late, before);
  await fs.writeFile(
    path.join(fixture.directory, 'deps/api.cjs'),
    fixture.source.replace('called=true;', "called=true;require('./late.cjs');")
  );
  const result = runBenchmark(fixture, { out: late });

  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /report would overwrite an input/i);
  assert.match(result.stdout, /merge:/);
  assert.equal(await fs.readFile(late, 'utf8'), before);
});

test('benchmark keeps ordinary new and existing report files valid beside inputs', async (t) => {
  const fixture = await benchmarkFixture(t);

  for (const name of ['fresh.json', 'entry.cjs.report.json']) {
    const output = path.join(fixture.directory, name);

    if (name !== 'fresh.json') await fs.writeFile(output, 'previous report\n');
    const result = runBenchmark(fixture, { out: output });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    const report = JSON.parse(await fs.readFile(output, 'utf8'));

    assert.equal(report.results.length, 11);
    assert.ok(Number.isFinite(report.sink));
    assert.equal(report.sink, 8188416);
    assert.equal(report.getterReads, 9216);
    assert.ok(report.results.every((value) => value.iterations === 256 && value.samples.length === 5));
  }

  const stdout = runBenchmark(fixture);

  assert.equal(stdout.status, 0, stdout.stdout + stdout.stderr);
  assert.match(stdout.stdout, /Validated checksum 8188416; 11 benchmark cases/);
});

test('benchmark metadata tracking follows selected imports without rejecting unused targets', async (t) => {
  const variants = [
    { imports: { '#api': { node: './deps/api.cjs', default: 'file:///%zz' } }, request: '#api' },
    { imports: { '#api': { node: './deps/api.cjs', default: 'unused' } }, request: '#api' },
    { imports: { '#api': './deps/api.cjs', '#*': 'unused' }, request: '#api' },
    { imports: { '#api/*': './deps/api.cjs', '#*': 'unused' }, request: '#api/value' },
    { imports: { '#api': ['./deps/api.cjs', 'unused'] }, request: '#api' },
    { imports: { '#api': ['file:///%zz', './deps/api.cjs'] }, request: '#api' }
  ];

  for (const [index, variant] of variants.entries()) {
    await t.test(`selection ${index + 1}`, async (t) => {
      const fixture = await benchmarkFixture(t);
      const unused = path.join(fixture.directory, 'node_modules/unused');
      const output = path.join(unused, 'package.json');

      await fs.mkdir(unused, { recursive: true });
      // This package's manifest is not read by Node for the selected target.
      await fs.writeFile(output, JSON.stringify({ main: '../../deps/api.cjs' }));
      await fs.writeFile(
        path.join(fixture.directory, 'package.json'),
        JSON.stringify({ main: './entry.cjs', imports: variant.imports })
      );
      await fs.writeFile(
        path.join(fixture.directory, 'entry.cjs'),
        `module.exports=require(${JSON.stringify(variant.request)});\n`
      );
      const control = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(fixture.directory)})`], {
        encoding: 'utf8'
      });

      assert.equal(control.status, 0, control.stdout + control.stderr);
      const result = runBenchmark(fixture, { out: output });

      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(JSON.parse(await fs.readFile(output, 'utf8')).sink, 8188416);
      const stdout = runBenchmark(fixture);

      assert.equal(stdout.status, 0, stdout.stdout + stdout.stderr);
      assert.match(stdout.stdout, /Validated checksum 8188416/);
    });
  }
});

test('benchmark rejects non-finite totals in calibration, warmups and samples without replacing reports', async (t) => {
  for (const [phase, validCalls] of [
    ['calibration', 0],
    ['warmup', 512],
    ['sample', 2048]
  ]) {
    for (const invalid of ['Infinity', '-Infinity', 'NaN', 'overflow']) {
      await t.test(`${phase}: ${invalid}`, async (t) => {
        const fixture = await benchmarkFixture(t);
        const output = path.join(fixture.directory, 'report.json');
        const corrupt = invalid === 'overflow' ? 'value.a=Number.MAX_VALUE;value.f=0;' : `value.a=${invalid};`;

        await fs.writeFile(
          path.join(fixture.directory, 'entry.cjs'),
          `const api=require(${fixture.api});let calls=0;exports.withDefaults=function(){const value=Reflect.apply(api.withDefaults,this,arguments);if(++calls>${validCalls}){${corrupt}}return value;};exports.createDefaultsMerger=api.createDefaultsMerger;\n`
        );
        await fs.writeFile(output, 'previous report\n');
        const result = runBenchmark(fixture, { out: output });

        assert.notEqual(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stderr, /non-finite benchmark checksum/i);
        assert.doesNotMatch(result.stdout, /Validated checksum/);
        assert.equal(await fs.readFile(output, 'utf8'), 'previous report\n');
      });
    }
  }
});

test('benchmark retains finite calibration mismatches and leaves previous reports intact', async (t) => {
  const fixture = await benchmarkFixture(t);
  const output = path.join(fixture.directory, 'report.json');

  await fs.writeFile(
    path.join(fixture.directory, 'entry.cjs'),
    `const api=require(${fixture.api});exports.withDefaults=function(){const value=Reflect.apply(api.withDefaults,this,arguments);value.a=99;return value;};exports.createDefaultsMerger=api.createDefaultsMerger;\n`
  );
  await fs.writeFile(output, 'previous report\n');
  const result = runBenchmark(fixture, { baseline: packageRoot, out: output });

  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /calibration result mismatch/);
  assert.equal(await fs.readFile(output, 'utf8'), 'previous report\n');
});

test('ordinary and coverage runners execute inside parent workers and report failing assertions', async (t) => {
  const directory = await runnerFixture(t);
  const file = path.join(directory, 'test/covered.test.cjs');
  const source = [
    "const { test } = require('node:test');",
    "const assert = require('node:assert/strict');",
    "test('runner control', () => {",
    "  assert.equal(process.env.GO_DEFAULTS_RUNNER_CONTROL, 'preserved');",
    "  assert.equal(require('../src/index.cjs').value, 1);",
    '});',
    ''
  ].join('\n');
  const environment = {
    ...process.env,
    NODE_TEST_CONTEXT: 'child-v8',
    GO_DEFAULTS_RUNNER_CONTROL: 'preserved'
  };

  for (const options of [[], ['--coverage']]) {
    const run = () =>
      spawnSync(process.execPath, ['scripts/test.js', ...options], {
        cwd: directory,
        encoding: 'utf8',
        env: environment
      });

    await fs.writeFile(file, source);
    const passing = run();

    assert.equal(passing.status, 0, passing.stdout + passing.stderr);
    assert.match(passing.stdout, /(?:#|ℹ) tests 1\b/);
    assert.match(passing.stdout, /runner control/);

    await fs.writeFile(file, source.replace('.value, 1);', '.value, 2);'));
    const failing = run();

    assert.equal(failing.status, 1, failing.stdout + failing.stderr);
    assert.match(failing.stdout, /(?:#|ℹ) tests 1\b/);
    assert.match(failing.stdout, /(?:#|ℹ) fail 1\b/);
  }
});

for (const coverage of [false, true]) {
  test(
    (coverage ? 'coverage' : 'ordinary') + ' runner rejects zero exits before tests and cleanup finish',
    async (t) => {
      const directory = await runnerFixture(t);
      const file = path.join(directory, 'test/covered.test.cjs');
      const started = path.join(directory, 'started.marker');
      const completed = path.join(directory, 'completed.marker');
      const prefix = [
        "const { test, after } = require('node:test');",
        "const fs = require('node:fs');",
        "require('../src/index.cjs');",
        "const started = () => fs.writeFileSync('started.marker', 'started');",
        "const completed = () => fs.writeFileSync('completed.marker', 'completed');"
      ].join('\n');
      const cases = [
        ['before registration', "process.exit(0);\ntest('unreached callback', completed);", false],
        ['after registration', "test('unreached callback', completed);\nprocess.exit(0);", false],
        ['inside callback', "test('interrupted callback', () => { started(); process.exit(0); completed(); });", true],
        [
          'inside async callback',
          "test('interrupted async callback', async () => { started(); await new Promise(setImmediate); process.exit(0); completed(); });",
          true
        ],
        ['beside another passing file', 'process.exit(0);', false],
        [
          'inside cleanup',
          "test('finished callback', started);\nafter(() => { process.exit(0); completed(); });",
          true
        ],
        [
          'inside beforeExit cleanup',
          "test('finished callback', started);\nprocess.once('beforeExit', () => { process.exit(0); completed(); });",
          true
        ],
        [
          'inside deferred beforeExit cleanup',
          "test('finished callback', started);\nprocess.once('beforeExit', () => setImmediate(() => { process.exit(0); completed(); }));",
          true
        ],
        [
          'inside exit cleanup',
          "test('finished callback', started);\nprocess.once('exit', () => { process.exit(0); completed(); });",
          true
        ]
      ];

      for (const [label, source, didStart] of cases) {
        await fs.rm(started, { force: true });
        await fs.rm(completed, { force: true });
        await fs.writeFile(file, prefix + '\n' + source + '\n');
        if (label === 'beside another passing file') {
          await fs.writeFile(
            path.join(directory, 'test/another.test.cjs'),
            "require('node:test')('other file passed', () => require('node:fs').writeFileSync('other.marker', 'other'));\n"
          );
        }

        const result = spawnSync(process.execPath, ['scripts/test.js', ...(coverage ? ['--coverage'] : [])], {
          cwd: directory,
          encoding: 'utf8'
        });

        assert.equal(result.status, 1, label + '\n' + result.stdout + result.stderr);
        assert.match(result.stdout + result.stderr, /Runtime test execution incomplete/, label);
        if (didStart) assert.equal(await fs.readFile(started, 'utf8'), 'started', label);
        else await assert.rejects(fs.readFile(started), { code: 'ENOENT' }, label);
        await assert.rejects(fs.readFile(completed), { code: 'ENOENT' }, label);
        if (label === 'beside another passing file') {
          assert.equal(await fs.readFile(path.join(directory, 'other.marker'), 'utf8'), 'other');
        }
      }
    }
  );
}

test('runner completion preserves async callbacks, explicit skips and todos', async (t) => {
  const directory = await runnerFixture(t);
  const file = path.join(directory, 'test/covered.test.cjs');
  const marker = path.join(directory, 'completed.marker');
  const source = [
    "const { test, after } = require('node:test');",
    "const fs = require('node:fs');",
    "require('../src/index.cjs');",
    "test('async completion control', async () => { await new Promise(setImmediate); fs.writeFileSync('completed.marker', 'callback'); });",
    "test('optional control', { skip: 'optional capability' }, () => { throw new Error('Skipped callback ran'); });",
    "test.todo('planned control');",
    "after(async () => { await new Promise(setImmediate); fs.appendFileSync('completed.marker', '/cleanup'); });"
  ].join('\n');

  for (const options of [[], ['--coverage']]) {
    await fs.writeFile(file, source);
    const passing = spawnSync(process.execPath, ['scripts/test.js', ...options], { cwd: directory, encoding: 'utf8' });

    assert.equal(passing.status, 0, passing.stdout + passing.stderr);
    assert.equal(await fs.readFile(marker, 'utf8'), 'callback/cleanup');
    assert.match(passing.stdout, /optional capability/);
    assert.match(passing.stdout, /(?:#|ℹ) skipped 1\b/);
    assert.match(passing.stdout, /(?:#|ℹ) todo 1\b/);

    await fs.writeFile(file, source.replace(/^test\('async completion control'.*\n/m, '').replace(/^after\(.*$/m, ''));
    await fs.rm(marker);
    const skipped = spawnSync(process.execPath, ['scripts/test.js', ...options], { cwd: directory, encoding: 'utf8' });

    assert.equal(skipped.status, 0, skipped.stdout + skipped.stderr);
    assert.match(skipped.stdout, /(?:#|ℹ) skipped 1\b/);
    assert.match(skipped.stdout, /(?:#|ℹ) todo 1\b/);
    await assert.rejects(fs.readFile(marker), { code: 'ENOENT' });
  }
});

test('runner completion does not change ordinary forked helpers', async (t) => {
  const directory = await runnerFixture(t);
  const source = [
    "const { test } = require('node:test');",
    "const { fork } = require('node:child_process');",
    "const assert = require('node:assert/strict');",
    "const fs = require('node:fs');",
    "require('../src/index.cjs');",
    "test('fork completion control', async () => {",
    '  assert.throws(() => process.exit({}), TypeError);',
    "  const code = await new Promise((resolve, reject) => fork(require('node:path').join(__dirname, 'child.cjs')).once('error', reject).once('exit', resolve));",
    '  assert.equal(code, 0);',
    "  fs.writeFileSync('fork.marker', 'completed');",
    '});'
  ].join('\n');

  await fs.writeFile(path.join(directory, 'test/child.cjs'), 'process.exit(0);\n');
  await fs.writeFile(path.join(directory, 'test/covered.test.cjs'), source);

  for (const options of [[], ['--coverage']]) {
    await fs.rm(path.join(directory, 'fork.marker'), { force: true });
    const result = spawnSync(process.execPath, ['scripts/test.js', ...options], { cwd: directory, encoding: 'utf8' });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(await fs.readFile(path.join(directory, 'fork.marker'), 'utf8'), 'completed');
  }
});

test('runner keeps empty discovery and forwarded Node flags invalid', async (t) => {
  const directory = await runnerFixture(t);
  const filtered = spawnSync(process.execPath, ['scripts/test.js', '--test-name-pattern=missing'], {
    cwd: directory,
    encoding: 'utf8'
  });

  assert.equal(filtered.status, 1, filtered.stdout + filtered.stderr);
  assert.match(filtered.stderr, /Usage: node scripts\/test\.js \[--coverage\]/);

  await fs.unlink(path.join(directory, 'test/covered.test.cjs'));
  for (const options of [[], ['--coverage']]) {
    const empty = spawnSync(process.execPath, ['scripts/test.js', ...options], { cwd: directory, encoding: 'utf8' });

    assert.equal(empty.status, 1, empty.stdout + empty.stderr);
    assert.match(empty.stderr, /No Node contract tests found/);
  }
});
