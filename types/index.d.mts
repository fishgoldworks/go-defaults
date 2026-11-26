import createDefaultsMerger = require('./createDefaultsMerger.cjs');
import defaultIf = require('./defaultIf.cjs');
import withDefaults = require('./withDefaults.cjs');
export { createDefaultsMerger, defaultIf, withDefaults };
declare const Defaults: {
  createDefaultsMerger: typeof createDefaultsMerger;
  defaultIf: typeof defaultIf;
  withDefaults: typeof withDefaults;
};
export default Defaults;
