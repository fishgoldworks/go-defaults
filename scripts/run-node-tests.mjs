import { fileURLToPath } from 'node:url';
import { run } from './process.mjs';

const files = process.argv.slice(2);

if (!files.length || files.some((file) => !file || file.startsWith('-')))
  throw new Error('Usage: node scripts/run-node-tests.mjs <test-file-or-glob> [...]');
const environment = { ...process.env, GO_DEFAULTS_TEST_COMPLETION: '1' };

delete environment.NODE_TEST_CONTEXT;
process.stdout.write(
  run(
    process.execPath,
    ['--require', fileURLToPath(new URL('./test-completion.cjs', import.meta.url)), '--test', ...files],
    process.cwd(),
    environment
  )
);
