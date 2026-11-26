import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { run } from './process.mjs';

export async function runConsumerCheck(executable, args, directory, kind) {
  const temporary = await mkdtemp(path.join(directory, '.go-defaults-consumer-check-'));
  const file = path.join(temporary, 'completed.json');
  const token = randomUUID();
  const env = {
    ...process.env,
    GO_DEFAULTS_CONSUMER_COMPLETION_FILE: file,
    GO_DEFAULTS_CONSUMER_COMPLETION_TOKEN: token
  };

  delete env.NODE_TEST_CONTEXT;
  let output, failure;

  try {
    const node = run(executable, ['--version'], directory, env).trim();

    output = run(executable, args, directory, env);
    try {
      const record = JSON.parse(await readFile(file, 'utf8'));

      assert.deepEqual(record, { token, kind, node });
    } catch (error) {
      if (output) process.stdout.write(output);
      throw new Error('Consumer check execution incomplete: ' + kind + '.', { cause: error });
    }
  } catch (error) {
    failure = { error };
  }

  try {
    await rm(temporary, { recursive: true, force: true });
  } catch (error) {
    if (failure)
      throw new AggregateError([failure.error, error], 'Consumer verification and completion cleanup failed.', {
        cause: error
      });
    throw error;
  }

  if (failure) throw failure.error;

  return output;
}
