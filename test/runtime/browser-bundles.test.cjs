const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const checkBrowserContract = require('../consumers/browser-contract.cjs');
const directory = process.env.GO_DEFAULTS_TEST_PACKAGE_ONLY
  ? path.dirname(require.resolve('go-defaults'))
  : path.resolve(__dirname, '../../package/dist');

for (const filename of ['go-defaults.js', 'go-defaults.min.js']) {
  test(
    filename + ': standalone global, CommonJS and AMD preserve the defaults contract',
    {
      skip: Boolean(process.env.GO_DEFAULTS_TEST_SOURCE_ONLY)
    },
    () => {
      const file = path.join(directory, filename);
      assert.ok(fs.existsSync(file), 'Missing standalone browser bundle: ' + filename);
      const code = fs.readFileSync(file, 'utf8');
      for (const loader of ['global', 'commonjs', 'amd']) {
        const context = vm.createContext({});
        if (loader === 'commonjs') vm.runInContext('var module = { exports: {} };', context);
        if (loader === 'amd')
          vm.runInContext(
            'var captured; function define(dependencies, factory) { if (dependencies.length) throw Error("external dependency"); captured = factory(); } define.amd = {};',
            context
          );
        // No require, process or external module loader is available to the bundle.
        vm.runInContext('"use strict";\n' + code, context, { filename });
        const expression = loader === 'global' ? 'goDefaults' : loader === 'commonjs' ? 'module.exports' : 'captured';
        assert.equal(vm.runInContext('(' + checkBrowserContract.toString() + ')(' + expression + ')', context), true);
        if (loader !== 'global') assert.equal(context.goDefaults, undefined);
      }
    }
  );
}
