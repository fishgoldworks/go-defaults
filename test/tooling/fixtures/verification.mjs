import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { root } from '../../../scripts/package-layout.mjs';
import { npm } from '../../../scripts/process.mjs';

export const auxiliaryScripts = ['test:docs', 'test:build', 'test:tooling', 'test:artifacts', 'test:release'];

export async function verificationFixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'go-defaults-verification-'));

  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  for (const name of ['scripts', 'src', 'package'])
    await fs.cp(path.join(root, name), path.join(directory, name), { recursive: true });
  const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));

  for (const phase of ['lint', 'format:check', 'build', 'coverage', 'test:types', 'test:package'])
    metadata.scripts[phase] = 'node phase.cjs ' + phase;
  await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify(metadata, null, 2));
  const log = path.join(directory, 'events.jsonl');

  await fs.writeFile(log, '');
  await fs.writeFile(
    path.join(directory, 'phase.cjs'),
    String.raw`
    const fs=require('fs'),path=require('path'),assert=require('assert');
    const [phase,...args]=process.argv.slice(2);
    const record={phase,args,node:process.version};
    if(phase==='test:package') {
      assert.ok(args.includes('--tarball'));
      assert.ok(fs.existsSync(args[args.indexOf('--tarball')+1]));
      assert.strictEqual(path.resolve(args[args.indexOf('--compare-package')+1]),path.join(process.cwd(),'package'));
      assert.strictEqual(args.includes('--browser'),process.env.WORKFLOW_ALL==='1');
    }
    fs.appendFileSync(process.env.WORKFLOW_LOG,JSON.stringify(record)+'\n');
    if(phase===process.env.WORKFLOW_DELETE_AT){
      const file=path.join(process.cwd(),'package.json');
      const metadata=JSON.parse(fs.readFileSync(file,'utf8'));delete metadata.scripts[process.env.WORKFLOW_DELETE_SCRIPT||'test:types'];
      fs.writeFileSync(file,JSON.stringify(metadata));
    }
    if(phase===process.env.WORKFLOW_FAIL_PHASE){console.error('Workflow leaf failure control:'+phase);process.exit(7);}
  `
  );
  await fs.writeFile(
    path.join(directory, 'register.cjs'),
    String.raw`
    const fs=require('fs');const {test,after}=require('node:test');
    module.exports=(phase)=>{
      const mode=process.env.WORKFLOW_TARGET===phase?process.env.WORKFLOW_TEST_MODE:'pass';
      const record=event=>fs.appendFileSync(process.env.WORKFLOW_LOG,JSON.stringify({phase,event,node:process.version})+'\n');
      record('loaded');
      test(phase+' execution control',async()=>{
        record('asserted');
        if(mode==='body')process.exit(0);
        if(mode==='assertion')throw Error('Workflow assertion failure reached');
        await new Promise(resolve=>setTimeout(resolve,5));
      });
      after(async()=>{
        await new Promise(resolve=>setTimeout(resolve,5));
        if(mode==='cleanup')process.exit(0);
        record('cleaned');
      });
      if(mode==='load')process.exit(0);
    };
  `
  );
  const files = [
    ['test/docs/docs.test.js', 'test:docs'],
    ['test/build.test.mjs', 'test:build'],
    ['test/build/replace-directory.test.mjs', 'build companion'],
    ['test/tooling/workflow.test.mjs', 'test:tooling'],
    ['test/artifacts.test.mjs', 'test:artifacts'],
    ['test/browser/bundles.test.cjs', 'artifact companion'],
    ['test/package/release.test.mjs', 'test:release']
  ];

  for (const [file, phase] of files) {
    const target = path.join(directory, file);
    const registerPath = path.join(directory, 'register.cjs');
    const register = JSON.stringify(file.endsWith('.mjs') ? pathToFileURL(registerPath).href : registerPath);

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(
      target,
      file.endsWith('.mjs')
        ? `import register from ${register};register(${JSON.stringify(phase)});`
        : `require(${register})(${JSON.stringify(phase)});`
    );
  }

  for (const [file, phase] of [
    ['docs.js', 'docs freshness'],
    ['test-examples.js', 'docs examples'],
    ['build.mjs', 'package freshness'],
    ['test-artifacts.mjs', 'artifact CLI']
  ]) {
    const requirePhase = file.endsWith('.mjs')
      ? "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"
      : '';

    await fs.writeFile(
      path.join(directory, 'scripts', file),
      requirePhase + `process.argv.splice(2,0,${JSON.stringify(phase)});require('../phase.cjs');`
    );
  }

  const cli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');

  assert.ok(cli, 'Run workflow regressions with the installed npm CLI available');
  async function execute(args, overrides = {}) {
    await fs.writeFile(log, '');
    const env = {
      ...process.env,
      WORKFLOW_LOG: log,
      PATH: path.dirname(process.execPath) + path.delimiter + process.env.PATH
    };

    delete env.NODE_TEST_CONTEXT;
    delete env.GO_DEFAULTS_TEST_COMPLETION;
    delete env.GO_DEFAULTS_CI_CANDIDATE_OUTPUT;
    const result = spawnSync(process.execPath, args, {
      cwd: directory,
      env: { ...env, ...overrides },
      encoding: 'utf8',
      timeout: 90000,
      maxBuffer: 8 * 1024 * 1024
    });
    const events = (await fs.readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);

    return { ...result, events };
  }

  async function pack() {
    const destination = path.join(directory, 'artifacts');

    await fs.mkdir(destination, { recursive: true });
    const [packed] = JSON.parse(
      npm(['pack', '--ignore-scripts', '--json', '--pack-destination', destination], path.join(directory, 'package'))
    );

    return path.join(destination, packed.filename);
  }

  return { directory, metadata, pack, execute, script: (name, env) => execute([cli, 'run', name], env) };
}
