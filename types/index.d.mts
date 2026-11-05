import defaultsFor = require('./defaultsFor.cjs');
import withDefaults = require('./withDefaults.cjs');
export { defaultsFor, withDefaults };
declare const Defaults: { defaultsFor: typeof defaultsFor; withDefaults: typeof withDefaults };
export default Defaults;
