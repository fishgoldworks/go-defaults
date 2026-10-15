// Run the same behavior contracts against authored source and the built or installed package.
module.exports = process.env.GO_DEFAULTS_TEST_PACKAGE_ONLY
  ? [['package', require('go-defaults')]]
  : process.env.GO_DEFAULTS_TEST_SOURCE_ONLY
    ? [['source', require('../../src/index.cjs')]]
    : [
        ['source', require('../../src/index.cjs')],
        ['package', require('../../package/')]
      ];
