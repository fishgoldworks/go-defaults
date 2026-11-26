import Defaults from 'go-defaults';
import create, { createDefaultsMerger } from 'go-defaults/createDefaultsMerger';
import direct, { withDefaults } from 'go-defaults/withDefaults';
import select, { defaultIf } from 'go-defaults/defaultIf';
const value: number = Defaults.withDefaults({ value: 1 }, { value: undefined }).value;
const configured: null = Defaults.createDefaultsMerger()({ value: 1 }, { value: null }).value;

if (value !== 1 || configured !== null || direct !== withDefaults || direct !== Defaults.withDefaults)
  throw new Error('Default import behaviour differs');
const selected: number = select(undefined, 10);

if (select !== defaultIf || select !== Defaults.defaultIf || selected !== 10)
  throw new Error('Single-value default import identity or behaviour differs');

const mergeIgnoringNull = create({ shouldFallback: (value) => value === null });

if (
  create !== createDefaultsMerger ||
  create !== Defaults.createDefaultsMerger ||
  mergeIgnoringNull({ title: 'Home' }, { title: null }).title !== 'Home'
)
  throw new Error('Configured default import identity or behaviour differs');
