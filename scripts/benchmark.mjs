// Paired microbenchmarks. Both inputs must already be built; this script never
// changes dependencies, rebuilds a package, or downloads a baseline.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { writeFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (
    !['--baseline', '--candidate', '--out', '--rounds', '--sample-ms'].includes(args[i]) ||
    args[i + 1] === undefined
  ) {
    throw new Error(
      'Usage: node scripts/benchmark.mjs --baseline /path/to/previous/package [--candidate /path/to/package] [--out results.json] [--rounds 11] [--sample-ms 20]'
    );
  }
  options[args[i].slice(2)] = args[i + 1];
}
if (!options.baseline) throw new Error('--baseline is required; supply a package directory or CommonJS entry file.');
const rounds = Number(options.rounds ?? 11);
const sampleMs = Number(options['sample-ms'] ?? 20);
if (
  !Number.isInteger(rounds) ||
  rounds < 5 ||
  rounds > 101 ||
  !Number.isFinite(sampleMs) ||
  sampleMs < 5 ||
  sampleMs > 1000
) {
  throw new RangeError('rounds must be 5..101 and sample-ms must be 5..1000.');
}
const paths = { baseline: path.resolve(options.baseline), candidate: path.resolve(options.candidate ?? root) };
const load = (file) =>
  statSync(file).isDirectory() ? createRequire(path.join(file, 'package.json'))('./') : require(file);
const modules = { baseline: load(paths.baseline), candidate: load(paths.candidate) };
for (const [name, api] of Object.entries(modules)) {
  for (const key of ['withDefaults', 'defaultsFor']) {
    if (typeof api[key] !== 'function') throw new TypeError(`${name} does not export ${key}`);
  }
}
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
let getterReads = 0;
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
const cases = [
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
    name: 'defaultsFor: reusable config',
    kind: 'changed',
    make: (api) => {
      const configure = api.defaultsFor(small);
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

let sink = 0;
function time(run, iterations) {
  let sum = 0;
  const start = performance.now();
  for (let i = 0; i < iterations; i += 1) sum += run(i);
  const ms = performance.now() - start;
  sink = (sink + sum) % 2147483647;
  return { ms, sum };
}
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const results = [];
for (const [index, benchmark] of cases.entries()) {
  const runners = { baseline: benchmark.make(modules.baseline), candidate: benchmark.make(modules.candidate) };
  // Calibration and warmup are discarded. Both versions use exactly the same
  // iteration count and consume their outputs; order alternates within each pair.
  let iterations = 256;
  while (true) {
    const a = time(runners.baseline, iterations);
    const b = time(runners.candidate, iterations);
    if (a.sum !== b.sum) throw new Error(`${benchmark.name}: calibration result mismatch`);
    if (Math.min(a.ms, b.ms) >= sampleMs || iterations >= 8388608) break;
    iterations *= 2;
  }
  for (let warm = 0; warm < 3; warm += 1) {
    time(runners.baseline, iterations);
    time(runners.candidate, iterations);
  }
  const samples = [];
  for (let round = 0; round < rounds; round += 1) {
    const order = (index + round) % 2 === 0 ? ['baseline', 'candidate'] : ['candidate', 'baseline'];
    const pair = {};
    for (const side of order) pair[side] = time(runners[side], iterations);
    if (pair.baseline.sum !== pair.candidate.sum) throw new Error(`${benchmark.name}: measured result mismatch`);
    samples.push({
      order: order.join('/'),
      baselineNs: (pair.baseline.ms * 1e6) / iterations,
      candidateNs: (pair.candidate.ms * 1e6) / iterations
    });
  }
  const baselineNs = median(samples.map((value) => value.baselineNs));
  const candidateNs = median(samples.map((value) => value.candidateNs));
  const result = {
    name: benchmark.name,
    kind: benchmark.kind,
    iterations,
    baselineNs,
    candidateNs,
    speedup: baselineNs / candidateNs,
    timeReductionPercent: (1 - candidateNs / baselineNs) * 100,
    samples
  };
  results.push(result);
  console.log(
    `${result.name}: ${baselineNs.toFixed(1)} -> ${candidateNs.toFixed(1)} ns/op (${result.speedup.toFixed(2)}x)`
  );
}
const report = {
  date: new Date().toISOString(),
  environment: {
    node: process.version,
    v8: process.versions.v8,
    platform: process.platform,
    arch: process.arch,
    cpu: os.cpus()[0]?.model,
    execArgv: process.execArgv
  },
  paths,
  rounds,
  sampleMs,
  method:
    'Paired alternating order; discarded calibration and three warmups; identical iterations; median ns/op; consumed outputs. Single-process Node microbenchmarks, not browser or application timings.',
  sink,
  getterReads,
  results
};
if (options.out) await writeFile(path.resolve(options.out), JSON.stringify(report, null, 2) + '\n');
console.log(`Validated checksum ${sink}; ${results.length} benchmark cases.`);
