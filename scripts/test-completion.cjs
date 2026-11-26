// Consume the marker in test workers so ordinary forks can inherit the preload safely.
if (process.env.NODE_TEST_CONTEXT && process.env.GO_DEFAULTS_TEST_COMPLETION === '1') {
  delete process.env.GO_DEFAULTS_TEST_COMPLETION;
  const { after } = require('node:test');
  const originalExit = process.exit;
  let completed = false;
  let reported = false;

  function rejectIncompleteExit() {
    if (!reported) {
      reported = true;
      console.error(
        'Runtime test execution incomplete: ' + process.argv[1] + ' exited before tests and cleanup finished.'
      );
    }

    if (!Number(process.exitCode)) process.exitCode = 1;
  }

  process.exit = function (...args) {
    // Delegate argument validation to the same native setter used by process.exit.
    if (args.length) process.exitCode = args[0];
    rejectIncompleteExit();

    // Invalidate before calling exit: re-entry from an exit listener emits no new event.
    return Reflect.apply(originalExit, this, [process.exitCode]);
  };

  after(() => {
    completed = true;
  });
  process.once('exit', () => {
    if (!completed) rejectIncompleteExit();
  });
}
