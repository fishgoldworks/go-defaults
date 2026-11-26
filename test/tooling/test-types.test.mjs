import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cp, copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { root } from '../../scripts/package-layout.mjs';

async function typeGateFixture(t, version = '6.0.3') {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'go-defaults-type-gate-'));

  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const name of ['scripts', 'src', 'package', 'test']) await mkdir(path.join(directory, name));
  for (const name of ['test-types.mjs', 'process.mjs', 'package-layout.mjs', 'consumer-check.mjs'])
    await copyFile(path.join(root, 'scripts', name), path.join(directory, 'scripts', name));
  await cp(path.join(root, 'test/types'), path.join(directory, 'test/types'), { recursive: true });
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'go-defaults', private: true }));
  await writeFile(path.join(directory, 'src/index.cjs'), 'module.exports = {};\n');
  await writeFile(path.join(directory, 'package/package.json'), JSON.stringify({ name: 'go-defaults' }));
  const callsFile = path.join(directory, 'compiler-calls.jsonl');
  const executedFile = path.join(directory, 'executed.jsonl');
  const compiler = path.join(directory, 'compiler.cjs');
  const controlFile = path.join(directory, 'control.json');
  const source = `
const fs = require('node:fs');
const path = require('node:path');
const version = ${JSON.stringify(version)};
const callsFile = ${JSON.stringify(callsFile)};
const executedFile = ${JSON.stringify(executedFile)};
const control = JSON.parse(fs.readFileSync(${JSON.stringify(controlFile)}, 'utf8'));
const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log('Version ' + version);
} else {
  fs.appendFileSync(callsFile, JSON.stringify(args) + '\\n');
  if (Number(version.split('.')[0]) < 5 && args.includes('--verbatimModuleSyntax')) throw Error('Unsupported verbatimModuleSyntax');
  if (version.startsWith('5.0.') && args.includes('--isolatedModules') && args.includes('--verbatimModuleSyntax')) throw Error('Redundant isolation options');
  if (args.includes('--noUncheckedIndexedAccess')) {
    for (const file of args.filter(arg => /\\.(?:ts|cts|mts)$/.test(arg))) {
      if (!fs.existsSync(file)) throw Error('Strict fixture not staged: ' + file);
    }
    if (process.env.GO_DEFAULTS_TYPE_STRICT_FAILURE) throw Error('Strict compiler failure control');
  }
  const output = args.indexOf('--outDir');
  if (output >= 0) {
    fs.mkdirSync(args[output + 1], {recursive: true});
    const modern = args.some(arg => arg.endsWith('.mts'));
    for (const suffix of modern ? ['cjs', 'mjs'] : ['js']) {
      const code = (suffix === 'mjs' ? 'import fs from "fs";' : 'const fs = require("fs");') +
        'var previous = fs.existsSync(' + JSON.stringify(executedFile) + ') ? fs.readFileSync(' + JSON.stringify(executedFile) + ', "utf8") : "";' +
        'fs.appendFileSync(' + JSON.stringify(executedFile) + ', ' + JSON.stringify(suffix + '\\n') + ');' +
        (control.stop === suffix || (control.stop === 'selected' && suffix === 'js') ?
          (control.stop === 'selected' ? 'if (previous.split("\\\\n").filter(value => value === "js").length === 1) ' : '') + 'process.exit(0);' : '') +
        (control.failConsumer === suffix ? 'throw Error("Emitted consumer failure control");' : '') +
        'fs.appendFileSync(' + JSON.stringify(executedFile) + ', ' + JSON.stringify(suffix + ':complete\\n') + ');';
      fs.writeFileSync(path.join(args[output + 1], 'default-import.' + suffix), code);
    }
  }
}

`;

  await writeFile(compiler, source);
  const execute = (script, failStrict, control) => {
    writeFileSync(controlFile, JSON.stringify(control));
    const env = { ...process.env };

    delete env.GO_DEFAULTS_NODE8;
    if (control.selected) env.GO_DEFAULTS_NODE8 = process.execPath;
    if (failStrict) env.GO_DEFAULTS_TYPE_STRICT_FAILURE = '1';

    return spawnSync(
      process.execPath,
      [script, ...(script === 'scripts/test-types.mjs' ? ['--compiler', compiler] : [])],
      {
        cwd: directory,
        env,
        encoding: 'utf8',
        timeout: 60000
      }
    );
  };

  const run = (failStrict = false, control = {}) => execute('scripts/test-types.mjs', failStrict, control);

  return { directory, compiler, controlFile, callsFile, executedFile, run, execute };
}

for (const version of ['4.5.2', '4.7.2', '5.0.2', '6.0.3']) {
  test('type gate runs supported strict consumers and propagates compiler failures on ' + version, async (t) => {
    const { run, callsFile, executedFile } = await typeGateFixture(t, version);
    const passing = run();

    assert.equal(passing.status, 0, passing.stdout + passing.stderr);
    const calls = (await readFile(callsFile, 'utf8')).trim().split('\n').map(JSON.parse);
    const strict = calls.filter((args) => args.includes('--noUncheckedIndexedAccess'));

    assert.ok(strict.length > 0, 'The gate did not execute stricter consumer checks');
    assert.ok(strict.every((args) => args.includes('--isolatedModules') || args.includes('--verbatimModuleSyntax')));
    assert.ok(
      strict.some((args) => args.some((arg) => arg.endsWith('.ts'))),
      'Legacy consumers must stay covered'
    );
    if (version !== '4.5.2') {
      assert.ok(
        strict.some((args) => args.some((arg) => arg.endsWith('.cts'))),
        'CommonJS consumers must run'
      );
      assert.ok(
        strict.some((args) => args.some((arg) => arg.endsWith('.mts'))),
        'ES module consumers must run'
      );
    }

    const modernFlags = Number(version.split('.')[0]) >= 5;

    assert.ok(strict.every((args) => args.includes('--verbatimModuleSyntax') === modernFlags));
    assert.equal(
      strict.some((args) => args.includes('Bundler')),
      modernFlags
    );
    const executed = await readFile(executedFile, 'utf8');

    assert.match(executed, /js/);
    if (version !== '4.5.2') {
      assert.match(executed, /cjs/);
      assert.match(executed, /mjs/);
    }

    const failing = run(true);

    assert.notEqual(failing.status, 0, 'A stricter compiler failure must fail the gate');
    assert.match(failing.stdout + failing.stderr, /Strict compiler failure control/);
  });
}

for (const suffix of ['js', 'cjs', 'mjs']) {
  test('type gate rejects an unfinished emitted ' + suffix + ' consumer', async (t) => {
    const fixture = await typeGateFixture(t);
    const result = fixture.run(false, { stop: suffix });
    const executed = await readFile(fixture.executedFile, 'utf8');

    assert.ok(executed.split('\n').includes(suffix));
    assert.ok(!executed.split('\n').includes(suffix + ':complete'));
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /Consumer check execution incomplete/);
  });
}

test('type gate requires fresh completion for the selected legacy runtime', async (t) => {
  const fixture = await typeGateFixture(t);
  const result = fixture.run(false, { stop: 'selected', selected: true });
  const executed = (await readFile(fixture.executedFile, 'utf8')).trim().split('\n');

  assert.equal(executed.filter((entry) => entry === 'js').length, 2);
  assert.equal(executed.filter((entry) => entry === 'js:complete').length, 1);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /Consumer check execution incomplete/);
});

async function observeTypeGate(fixture, control = {}) {
  const observer = String.raw`
import fs from 'node:fs';
import cp from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {syncBuiltinESMExports} from 'node:module';
const control=JSON.parse(fs.readFileSync('control.json','utf8'));
const remove=fs.promises.rm,copy=fs.promises.cp,execute=cp.execFileSync;
const report={cleanupPaths:[]};
let verificationFailed=false,verificationError,cleanupError;
cp.execFileSync=function(...args){try{return Reflect.apply(execute,this,args);}catch(error){verificationFailed=true;verificationError=error;throw error;}};
fs.promises.cp=async function(...args){
  if(control.setupFailure){verificationFailed=true;verificationError=control.setupFailure==='null'?null:undefined;throw verificationError;}
  return Reflect.apply(copy,this,args);
};
fs.promises.rm=async function(file,...args){
  if(path.basename(String(file)).startsWith('go-defaults-types-')){
    report.cleanupPaths.push(String(file));
    if(control.cleanupFailure){cleanupError=new Error('Project cleanup failure control');throw cleanupError;}
  }
  return Reflect.apply(remove,this,[file,...args]);
};
syncBuiltinESMExports();
const {checkTypes}=await import('./scripts/test-types.mjs');
try{await checkTypes({compiler:path.resolve('compiler.cjs')});report.ok=true;}
catch(error){
  report.ok=false;
  report.verificationFailed=verificationFailed;
  report.returnedVerification=verificationFailed&&error===verificationError;
  report.returnedCleanup=error===cleanupError;
  report.name=error?.name;
  report.message=error?.message;
  report.errors=Array.isArray(error?.errors)?error.errors.map(value=>value?.message??String(value)):[];
  report.originalRetained=verificationFailed&&Array.isArray(error?.errors)&&error.errors[0]===verificationError;
  report.cleanupRetained=Array.isArray(error?.errors)&&error.errors[1]===cleanupError;
}
report.retained=report.cleanupPaths.map(file=>fs.existsSync(file));
for(const file of report.cleanupPaths){
  assert.equal(fs.realpathSync(path.dirname(file)),fs.realpathSync(os.tmpdir()));
  assert.ok(path.basename(file).startsWith('go-defaults-types-'));
  await remove(file,{recursive:true,force:true});
}
fs.writeFileSync('observed.json',JSON.stringify(report));
`;

  await writeFile(path.join(fixture.directory, 'observe.mjs'), observer);
  const result = fixture.execute('observe.mjs', !!control.failStrict, control);

  assert.equal(result.status, 0, result.stdout + result.stderr);

  return JSON.parse(await readFile(path.join(fixture.directory, 'observed.json'), 'utf8'));
}

for (const [label, control] of [
  ['compiler failure', { failStrict: true }],
  ['consumer failure', { failConsumer: 'js' }]
]) {
  test('type gate retains the original ' + label + ' when project cleanup succeeds', async (t) => {
    const fixture = await typeGateFixture(t);
    const report = await observeTypeGate(fixture, control);

    assert.equal(report.ok, false);
    assert.equal(report.returnedVerification, true);
    assert.deepEqual(report.retained, [false]);
  });

  test('type gate preserves ' + label + ' alongside project cleanup failure', async (t) => {
    const fixture = await typeGateFixture(t);
    const report = await observeTypeGate(fixture, { ...control, cleanupFailure: true });

    assert.equal(report.name, 'AggregateError');
    assert.equal(report.originalRetained, true);
    assert.equal(report.cleanupRetained, true);
    assert.ok(report.message.includes(report.cleanupPaths[0]));
    assert.deepEqual(report.retained, [true]);
  });
}

test('type gate preserves incomplete-consumer and project cleanup errors together', async (t) => {
  const fixture = await typeGateFixture(t);
  const report = await observeTypeGate(fixture, { stop: 'js', cleanupFailure: true });

  assert.equal(report.name, 'AggregateError');
  assert.match(report.errors[0], /Consumer check execution incomplete/);
  assert.equal(report.errors[1], 'Project cleanup failure control');
  assert.equal(report.cleanupRetained, true);
});

test('type gate retains project cleanup-only failure identity', async (t) => {
  const fixture = await typeGateFixture(t);
  const report = await observeTypeGate(fixture, { cleanupFailure: true });

  assert.equal(report.ok, false);
  assert.equal(report.verificationFailed, false);
  assert.equal(report.returnedCleanup, true);
  assert.deepEqual(report.retained, [true]);
});

for (const value of ['null', 'undefined']) {
  for (const cleanupFailure of [false, true]) {
    test('type gate preserves thrown ' + value + ' with cleanup failure ' + cleanupFailure, async (t) => {
      const fixture = await typeGateFixture(t);
      const report = await observeTypeGate(fixture, { setupFailure: value, cleanupFailure });

      assert.equal(report.ok, false);
      if (cleanupFailure) {
        assert.equal(report.name, 'AggregateError');
        assert.equal(report.originalRetained, true);
        assert.equal(report.cleanupRetained, true);
      } else {
        assert.equal(report.returnedVerification, true);
      }
    });
  }
}
