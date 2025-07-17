const fromExports = require('./dist/src');
const { SigmaDriver } = require('./dist/src/SigmaDriver');

const toExport = SigmaDriver;

// eslint-disable-next-line no-restricted-syntax
for (const [key, module] of Object.entries(fromExports)) {
  toExport[key] = module;
}

module.exports = toExport;
