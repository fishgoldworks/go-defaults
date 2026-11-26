// Workload inputs and operations for the paired defaults benchmark.
const record = (length, offset = 0) => Object.fromEntries(Array.from({ length }, (_, i) => [`k${i + offset}`, i + 1]));
const small = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 };
const configLayers = [small, { a: 7, b: undefined, c: 0 }, { f: 8, g: 9 }];
const largeLayers = [record(64), Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`k${i}`, i + 100]))];
const disjointLayers = Array.from({ length: 8 }, (_, i) => record(8, i * 8));
const repeatedLayers = Array.from({ length: 8 }, (_, i) => ({
  a: i,
  b: i + 1,
  c: i + 2,
  d: i + 3,
  e: i + 4,
  f: i + 5
}));
const symbol = Symbol('option');
const specialLayers = [
  JSON.parse('{"__proto__":1,"constructor":2,"toString":3}'),
  { [symbol]: 4 },
  JSON.parse('{"__proto__":5,"toString":6}')
];

export let getterReads = 0;
const accessorLayers = [
  small,
  {
    get a() {
      getterReads += 1;

      return 7;
    },
    get f() {
      getterReads += 1;

      return undefined;
    }
  }
];

export const cases = [
  {
    name: 'merge: small single source',
    kind: 'changed',
    make: (api) => () => {
      const value = api.withDefaults(small);

      return value.a + value.f;
    }
  },
  {
    name: 'merge: three config layers',
    kind: 'changed',
    make: (api) => () => {
      const value = api.withDefaults(...configLayers);

      return value.a + value.f + value.g;
    }
  },
  {
    name: 'merge: 64 keys, 32 overrides',
    kind: 'changed',
    make: (api) => () => {
      const value = api.withDefaults(...largeLayers);

      return value.k0 + value.k63;
    }
  },
  {
    name: 'merge: eight disjoint layers',
    kind: 'changed',
    make: (api) => () => {
      const value = api.withDefaults(...disjointLayers);

      return value.k0 + value.k63;
    }
  },
  {
    name: 'merge: eight overlapping layers',
    kind: 'changed',
    make: (api) => () => {
      const value = api.withDefaults(...repeatedLayers);

      return value.a + value.f;
    }
  },
  {
    name: 'factory: reusable config',
    kind: 'changed',
    make: (api) => {
      const configure =
        typeof api.createDefaultsMerger === 'function'
          ? api.createDefaultsMerger().bind(undefined, small)
          : api.defaultsFor(small);
      const overrides = configLayers.slice(1);

      return () => {
        const value = configure(...overrides);

        return value.a + value.f + value.g;
      };
    }
  },
  {
    name: 'merge: symbols and prototype collisions',
    kind: 'changed',
    make: (api) => () => {
      const value = api.withDefaults(...specialLayers);

      return value.__proto__ + value.toString + value[symbol];
    }
  },
  {
    name: 'merge: one prototype-colliding key',
    kind: 'safety-overhead',
    make: (api) => {
      const source = JSON.parse('{"__proto__":1}');

      return () => api.withDefaults(source).__proto__;
    }
  },
  {
    name: 'merge: accessor overrides',
    kind: 'changed',
    make: (api) => () => {
      const value = api.withDefaults(...accessorLayers);

      return value.a + value.f;
    }
  },
  {
    name: 'merge: create then read 100 times',
    kind: 'changed',
    make: (api) => () => {
      const value = api.withDefaults(...configLayers);
      let sum = 0;

      for (let j = 0; j < 100; j += 1) sum += value.a + value.f;

      return sum;
    }
  },
  {
    name: 'merge: empty call',
    kind: 'control',
    make: (api) => () => (Object.getPrototypeOf(api.withDefaults()) === Object.prototype ? 1 : 0)
  }
];
