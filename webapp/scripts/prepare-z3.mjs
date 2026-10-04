import { build } from 'esbuild';
import { mkdir, cp, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const loader = require.resolve('z3-solver/build/z3-built.js');
const wasmPath = require.resolve('z3-solver/build/z3-built.wasm');
const wasm = await readFile(wasmPath);
if (createHash('sha256').update(wasm).digest('hex') !== '2765f5443a5a3a41aace71a82dd954e3b8c885a7d621b50122b1aede0dc8348a') throw new Error('Unexpected official Z3 binary');
await mkdir('public/vendor', { recursive: true });
await cp(loader, 'public/vendor/z3-built.js');
const isGitHubPages = process.env.NEXT_PUBLIC_GITHUB_PAGES === 'true';
if (isGitHubPages) await cp(wasmPath, 'public/vendor/z3-built.wasm');
await build({ entryPoints: ['lib/solver.worker.ts'], outfile: 'public/vendor/orbment-worker.js', bundle: true, format: 'iife', platform: 'browser', target: 'es2022', define: {
  global: 'globalThis',
  'process.env.NEXT_PUBLIC_GITHUB_PAGES': JSON.stringify(isGitHubPages ? 'true' : 'false'),
  'process.env.NEXT_PUBLIC_BASE_PATH': JSON.stringify(process.env.NEXT_PUBLIC_BASE_PATH ?? '/KisekiOrb'),
}, minify: true });
console.log('Official Z3 verified; classic browser Worker prepared.');
