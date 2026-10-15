import Defaults from 'go-defaults';
const value: number = Defaults.withDefaults({ value: 1 }, { value: undefined }).value;
const configured: null = Defaults.defaultsFor({ value: 1 })({ value: null }).value;
if (value !== 1 || configured !== null) throw new Error('Default import behaviour differs');
