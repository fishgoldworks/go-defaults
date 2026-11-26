// Paired microbenchmarks. Both inputs must already be built; this script never
// changes dependencies, rebuilds a package, or downloads a baseline.
import { createRequire, registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { writeFile } from 'node:fs/promises';
import { statSync, existsSync, readFileSync } from 'node:fs';
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
const output = options.out ? path.resolve(options.out) : null;
const inputFiles = new Set();
const scannedDirectories = new Set();
const scannedRequests = new Set();

function recordInput(filename) {
  inputFiles.add(filename);
  let directory = path.dirname(filename);

  while (!scannedDirectories.has(directory)) {
    scannedDirectories.add(directory);
    inputFiles.add(path.join(directory, 'package.json'));
    const parent = path.dirname(directory);

    if (parent === directory) break;
    directory = parent;
  }
}

function conditionalTargets(target, conditions) {
  if (typeof target === 'string') {
    return [target];
  }

  if (target === null) {
    return [];
  }

  if (Array.isArray(target)) {
    return target.flatMap((value) => conditionalTargets(value, conditions) || []);
  }

  if (target && typeof target === 'object') {
    for (const [condition, value] of Object.entries(target)) {
      if (condition !== 'default' && !conditions.has(condition)) continue;
      const selected = conditionalTargets(value, conditions);

      if (selected !== undefined) {
        return selected;
      }
    }
  }
}

function recordImportTargets(specifier, context, nextResolve, resolvedURL) {
  let directory = path.dirname(fileURLToPath(context.parentURL));

  while (path.basename(directory) !== 'node_modules') {
    const manifest = path.join(directory, 'package.json');

    if (existsSync(manifest)) {
      let imports;

      try {
        imports = JSON.parse(readFileSync(manifest, 'utf8').replace(/^\uFEFF/, '')).imports;
      } catch {
        // Resolution already succeeded; do not replace its outcome with a later metadata read error.
        return;
      }

      const matches = [];

      for (const [key, target] of Object.entries(imports || {})) {
        const star = key.indexOf('*');
        let replacement = '';

        if (star < 0) {
          if (key !== specifier) continue;
        } else {
          const prefix = key.slice(0, star),
            suffix = key.slice(star + 1);

          if (
            !specifier.startsWith(prefix) ||
            !specifier.endsWith(suffix) ||
            specifier.length < prefix.length + suffix.length
          )
            continue;
          replacement = specifier.slice(prefix.length, specifier.length - suffix.length);
        }

        matches.push({ key, target, replacement, prefixLength: star < 0 ? Infinity : star });
      }

      // Exact keys win, then the longest matching pattern prefix and suffix.
      matches.sort((a, b) => b.prefixLength - a.prefixLength || b.key.length - a.key.length);
      const match = matches[0];

      if (!match) {
        return;
      }

      const parentURL = pathToFileURL(manifest).href;
      const targetContext = { ...context, parentURL };
      const targets = conditionalTargets(match.target, new Set(context.conditions)) || [];

      for (const value of targets) {
        const target = value.replace(/\*/g, () => match.replacement);

        // Invalid array alternatives can be ignored by Node. Let Node resolve
        // candidates without loading them, and retain only its selected URL.
        if (/^[a-z][a-z\d+.-]*:/i.test(target) || path.isAbsolute(target) || /^\.\.(?:[\\/]|$)/.test(target)) continue;
        let selected;

        try {
          selected = nextResolve(target, targetContext);
        } catch {
          continue;
        }

        if (selected.url === resolvedURL) {
          recordRequest(target, targetContext, nextResolve, resolvedURL);

          return;
        }
      }

      return;
    }

    const parent = path.dirname(directory);

    if (parent === directory) break;
    directory = parent;
  }
}

function recordRequest(specifier, context, nextResolve, resolvedURL) {
  const { parentURL } = context;
  const key = JSON.stringify([parentURL, specifier, [...context.conditions].sort()]);

  if (scannedRequests.has(key)) {
    return;
  }

  scannedRequests.add(key);
  let locations;

  if (path.isAbsolute(specifier)) locations = [specifier];
  else if (specifier.startsWith('file:')) locations = [fileURLToPath(specifier)];
  else if (!parentURL?.startsWith('file:') || /^[a-z][a-z\d+.-]*:/i.test(specifier)) {
    return;
  } else if (specifier.startsWith('#')) {
    recordImportTargets(specifier, context, nextResolve, resolvedURL);

    return;
  } else if (/^\.{1,2}(?:[\\/]|$)/.test(specifier)) {
    locations = [path.resolve(path.dirname(fileURLToPath(parentURL)), specifier)];
  } else {
    const name = specifier
      .split(/[\\/]/)
      .slice(0, specifier.startsWith('@') ? 2 : 1)
      .join(path.sep);

    locations = (createRequire(parentURL).resolve.paths(specifier) || []).flatMap((base) => [
      path.join(base, name),
      path.join(base, specifier)
    ]);
  }

  for (const location of locations) inputFiles.add(path.join(location, 'package.json'));
}

recordInput(fileURLToPath(import.meta.url));
// Observe resolution before loading workloads/APIs: require.cache alone omits
// ESM dependencies and manifests used by directory/package resolution.
registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);

    if (result.url.startsWith('file:')) {
      recordInput(fileURLToPath(result.url));
      if (context.parentURL?.startsWith('file:')) recordInput(fileURLToPath(context.parentURL));
      recordRequest(specifier, context, nextResolve, result.url);
    }

    return result;
  }
});

function checkOutput() {
  if (!output) {
    return;
  }

  for (const filename of Object.keys(require.cache)) recordInput(filename);
  const outputStat = statSync(output, { throwIfNoEntry: false, bigint: true });

  for (const input of inputFiles) {
    const inputStat = statSync(input, { throwIfNoEntry: false, bigint: true });

    if (
      output === path.resolve(input) ||
      (outputStat && inputStat && outputStat.dev === inputStat.dev && outputStat.ino === inputStat.ino)
    ) {
      throw new Error('Benchmark report would overwrite an input: ' + input);
    }
  }
}

const workload = await import('../benchmarks/cases.mjs');
const cases = workload.cases;
const load = (file) =>
  statSync(file).isDirectory() ? createRequire(path.join(file, 'package.json'))('./') : require(file);
const modules = { baseline: load(paths.baseline), candidate: load(paths.candidate) };

for (const [name, api] of Object.entries(modules)) {
  if (typeof api.withDefaults !== 'function') {
    throw new TypeError(`${name} does not export withDefaults`);
  }

  if (typeof api.createDefaultsMerger !== 'function' && typeof api.defaultsFor !== 'function') {
    throw new TypeError(`${name} does not export a defaults factory`);
  }
}

checkOutput();
let sink = 0;

function time(run, iterations) {
  let sum = 0;
  const start = performance.now();

  for (let i = 0; i < iterations; i += 1) sum += run(i);
  const ms = performance.now() - start;

  if (!Number.isFinite(sum)) throw new Error('Non-finite benchmark checksum.');
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

if (!Number.isFinite(sink)) throw new Error('Non-finite benchmark checksum.');
checkOutput();
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
  getterReads: workload.getterReads,
  results
};

if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(`Validated checksum ${sink}; ${results.length} benchmark cases.`);
