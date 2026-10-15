import Defaults = require('go-defaults');
import directMerge = require('go-defaults/withDefaults');
import directFactory = require('go-defaults/defaultsFor');

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
type Assert<Value extends true> = Value;
type PublicKeys = Assert<Equal<keyof typeof Defaults, 'defaultsFor' | 'withDefaults'>>;
type MergeSignature = Assert<Equal<typeof Defaults.withDefaults, typeof directMerge>>;
type FactorySignature = Assert<Equal<typeof Defaults.defaultsFor, typeof directFactory>>;
// @ts-expect-error The package does not expose arbitrary helper subpaths.
import unsupported from 'go-defaults/unsupported';
void unsupported;
