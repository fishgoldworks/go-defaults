import Defaults from 'go-defaults';
import direct, { withDefaults } from 'go-defaults/withDefaults';
const value: number = Defaults.withDefaults({ value: 1 }, { value: undefined }).value;
const configured: null = Defaults.defaultsFor({ value: 1 })({ value: null }).value;
if (value !== 1 || configured !== null || direct !== withDefaults || direct !== Defaults.withDefaults)
  throw new Error('Default import behaviour differs');
