import Defaults from 'go-defaults';
import create from 'go-defaults/createDefaultsMerger';
import merge from 'go-defaults/withDefaults';
import select from 'go-defaults/defaultIf';
const value: number = Defaults.withDefaults({ value: 1 }, { value: undefined }).value;
const configured: null = Defaults.createDefaultsMerger()({ value: 1 }, { value: null }).value;

if (value !== 1 || configured !== null) throw new Error('Default import behaviour differs');

const direct: number = merge({ retries: 3 }, { retries: undefined }).retries;
const configuredDirect: string = create()({ name: 'Guest' }, { name: '' }).name;

if (
  merge !== Defaults.withDefaults ||
  create !== Defaults.createDefaultsMerger ||
  direct !== 3 ||
  configuredDirect !== ''
)
  throw new Error('Subpath default import identity or behaviour differs');
const selected: number = select(undefined, 10);
const explicitNull: null = Defaults.defaultIf(null, 10);

if (select !== Defaults.defaultIf || selected !== 10 || explicitNull !== null)
  throw new Error('Single-value default import identity or behaviour differs');

const mergeIgnoringNull = create({ shouldFallback: (value) => value === null });

if (create !== Defaults.createDefaultsMerger || mergeIgnoringNull({ title: 'Home' }, { title: null }).title !== 'Home')
  throw new Error('Configured default import identity or behaviour differs');
