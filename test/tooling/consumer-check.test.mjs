import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { root } from '../../scripts/package-layout.mjs';

for (const mode of ['complete', 'nonzero', 'incomplete']) {
  for (const cleanupFails of [false, true]) {
    test(
      'consumer ' + mode + ' retains its result when completion cleanup ' + (cleanupFails ? 'fails' : 'succeeds'),
      async (t) => {
        const directory = await mkdtemp(path.join(os.tmpdir(), 'go-defaults-consumer-boundary-'));

        t.after(() => rm(directory, { recursive: true, force: true }));
        const program = String.raw`
        import assert from 'node:assert/strict';
        import fs from 'node:fs/promises';
        import path from 'node:path';
        import { syncBuiltinESMExports } from 'node:module';
        const [directory, module, mode, cleanupFails] = process.argv.slice(1);
        const cleanupError = new Error('Completion cleanup failure control');
        const remove = fs.rm;
        fs.rm = async (file, options) => {
          if (cleanupFails === 'true' && path.basename(file).startsWith('.go-defaults-consumer-check-')) throw cleanupError;
          return remove(file, options);
        };
        syncBuiltinESMExports();
        const { runConsumerCheck } = await import(module);
        const complete = 'require("fs").writeFileSync(process.env.GO_DEFAULTS_CONSUMER_COMPLETION_FILE, JSON.stringify({token:process.env.GO_DEFAULTS_CONSUMER_COMPLETION_TOKEN,kind:"control",node:process.version}),{flag:"wx"});';
        const source = 'process.stdout.write("Partial consumer output");' + (mode === 'incomplete' ? '' : complete) +
          (mode === 'nonzero' ? 'console.error("Original child failure control");process.exitCode=7;' : '');
        let failure;
        try {
          const output = await runConsumerCheck(process.execPath, ['-e', source], directory, 'control');
          assert.equal(output, 'Partial consumer output');
        } catch (error) { failure = { error }; }
        finally { fs.rm = remove; syncBuiltinESMExports(); }
        if (mode === 'complete' && cleanupFails === 'false') assert.equal(failure, undefined);
        else {
          assert.ok(failure);
          let original = failure.error;
          if (cleanupFails === 'true') {
            if (mode === 'complete') assert.strictEqual(original, cleanupError);
            else {
              assert.ok(original instanceof AggregateError);
              assert.equal(original.errors.length, 2);
              assert.strictEqual(original.errors[1], cleanupError);
              assert.strictEqual(original.cause, cleanupError);
              original = original.errors[0];
            }
          }
          if (mode === 'nonzero') {
            assert.equal(original.status, 7);
            assert.match(original.stderr, /Original child failure control/);
          } else if (mode === 'incomplete') assert.match(original.message, /Consumer check execution incomplete/);
        }
        if (cleanupFails === 'false') assert.deepEqual(await fs.readdir(directory), []);
        console.log('Completed boundary assertions');
      `;
        const result = spawnSync(
          process.execPath,
          [
            '--input-type=module',
            '-e',
            program,
            directory,
            pathToFileURL(path.join(root, 'scripts/consumer-check.mjs')).href,
            mode,
            String(cleanupFails)
          ],
          {
            encoding: 'utf8',
            timeout: 15000
          }
        );

        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stdout, /Completed boundary assertions/);
      }
    );
  }
}
