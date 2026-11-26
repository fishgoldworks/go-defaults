import Defaults = require('go-defaults');
import directCreate = require('go-defaults/createDefaultsMerger');
import directMerge = require('go-defaults/withDefaults');
import directValue = require('go-defaults/defaultIf');

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
type Assert<Value extends true> = Value;
type PublicKeys = Assert<Equal<keyof typeof Defaults, 'createDefaultsMerger' | 'defaultIf' | 'withDefaults'>>;
type CreateSignature = Assert<Equal<typeof Defaults.createDefaultsMerger, typeof directCreate>>;
type MergeSignature = Assert<Equal<typeof Defaults.withDefaults, typeof directMerge>>;
type ValueSignature = Assert<Equal<typeof Defaults.defaultIf, typeof directValue>>;
// @ts-expect-error The package does not expose arbitrary helper subpaths.
import unsupported from 'go-defaults/unsupported';
void unsupported;
// @ts-expect-error The old factory subpath was removed in 2.0.0.
import removed from 'go-defaults/defaultsFor';
void removed;
