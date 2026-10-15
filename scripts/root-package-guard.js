'use strict';
console.error(
  'The development root is private. Run npm run verify to check one generated package tarball, or npm run pack:package to create a candidate. Packing or publishing this directory is disabled.'
);
process.exitCode = 1;
