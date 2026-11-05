import Defaults from 'go-defaults';
import merge from 'go-defaults/withDefaults';
import factory from 'go-defaults/defaultsFor';
const value: number = Defaults.withDefaults({ value: 1 }, { value: undefined }).value;
const configured: null = Defaults.defaultsFor({ value: 1 })({ value: null }).value;
if (value !== 1 || configured !== null) throw new Error('Default import behaviour differs');

const direct: number = merge({ retries: 3 }, { retries: undefined }).retries;
const configuredDirect: string = factory({ name: 'Guest' })({ name: '' }).name;
if (merge !== Defaults.withDefaults || factory !== Defaults.defaultsFor || direct !== 3 || configuredDirect !== '')
  throw new Error('Subpath default import identity or behaviour differs');
