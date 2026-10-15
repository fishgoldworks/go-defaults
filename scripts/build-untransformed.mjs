// Diagnostic snapshot only; normal builds always use the pinned esbuild transform.
import { buildPackage } from './build.mjs';
if (process.argv.length > 2) throw new Error('Usage: node scripts/build-untransformed.mjs');
await buildPackage({ untransformed: true });
