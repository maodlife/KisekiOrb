// Run the shipped classic Worker and the unmodified official loader in a VM
// without Node globals. pthreads use real worker_threads and shared WASM memory.
// This tests the browser code path; browser HTTP/security policy needs separate QA.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Worker as NodeWorker, parentPort, workerData } from 'node:worker_threads';
import { webcrypto } from 'node:crypto';
const require = createRequire(import.meta.url);
const origin = workerData?.origin ?? process.env.Z3_TEST_ORIGIN;
async function readScript(path, file) {
  if (!origin) return readFile(file, 'utf8');
  const response = await fetch(new URL(path, origin));
  assert.equal(response.status, 200, path);
  assert.equal(response.headers.get('Cross-Origin-Embedder-Policy'), 'require-corp', path);
  assert.match(response.headers.get('Content-Type') ?? '', /application\/javascript/, path);
  return response.text();
}
const sources = workerData?.sources ?? {
  '/api/z3/worker': await readScript('/api/z3/worker', 'public/vendor/orbment-worker.js'),
  '/api/z3/loader': await readScript('/api/z3/loader', require.resolve('z3-solver/build/z3-built.js')),
};
class ClassicWorker {
  onmessage = null; onerror = null;
  constructor(url, options = {}) {
    this.native = new NodeWorker(new URL(import.meta.url), { workerData: { classic: true, sources, origin, url: String(url), name: options.name ?? '' } });
    this.native.on('message', data => this.onmessage?.({ data }));
    this.native.on('error', error => this.onerror?.({ message: error.message, filename: String(url) }));
  }
  postMessage(data) { this.native.postMessage(data); }
  terminate() { return this.native.terminate(); }
}
if (workerData?.classic) {
  const url = new URL(workerData.url, 'https://example.test');
  const context = vm.createContext({
    console, URL, performance, setTimeout, clearTimeout, setInterval, clearInterval,
    TextEncoder, TextDecoder, AbortController, crypto: webcrypto, WebAssembly,
    Worker: ClassicWorker, WorkerGlobalScope: class {}, crossOriginIsolated: true,
    name: workerData.name, location: { href: url.href },
    fetch: async input => {
      assert.equal(new URL(String(input), url).pathname, '/api/z3/wasm');
      if (origin) return fetch(new URL('/api/z3/wasm', origin));
      return new Response(await readFile(require.resolve('z3-solver/build/z3-built.wasm')));
    },
    postMessage: data => parentPort.postMessage(data),
  });
  context.self = context;
  context.importScripts = (...urls) => {
    for (const value of urls) {
      const pathname = new URL(value, url).pathname;
      assert.ok(sources[pathname], `Unexpected Worker script ${pathname}`);
      vm.runInContext(sources[pathname], context, { filename: pathname });
    }
  };
  vm.runInContext(sources[url.pathname], context, { filename: url.pathname });
  parentPort.on('message', data => context.onmessage?.({ data }));
} else {
  const { DEFAULT_GAME_DATA, createDefaultPlayerState } = await import('../lib/default-data.ts');
  const { equipBuild } = await import('../lib/equipment.ts');
  const game = DEFAULT_GAME_DATA, player = createDefaultPlayerState(game);
  const character = game.characters.find(c => c.id === 'kloe');
  const request = { character, quartz: game.quartz, arts: game.arts, resources: player.resources, equipment: player.equipment,
    slotPolicies: Object.fromEntries(character.slots.map(s => [s.id, { currentLevel: s.currentLevel, allowUpgrade: false, maxLevel: s.currentLevel }])),
    resourceMode: 'available_only', mustHaveArts: ['art-water-06', 'art-time-07'], rankingPreset: 'extra_arts', maxResults: 20, timeoutMs: 10_000 };
  const worker = new ClassicWorker('/api/z3/worker');
  try {
    for (let generation = 1; generation <= 2; generation++) {
      let candidates = 0, initialized = false;
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Classic Worker integration timed out')), 30_000);
        worker.onerror = error => { clearTimeout(timer); reject(new Error(error.message)); };
        worker.onmessage = ({ data }) => {
          assert.equal(data.generation, generation);
          if (data.type === 'progress' && data.progress.phase === 'initializing') initialized = true;
          if (data.type === 'candidate') candidates++;
          if (data.type === 'error') { clearTimeout(timer); reject(new Error(data.message)); }
          if (data.type === 'complete') { clearTimeout(timer); resolve(data.result); }
        };
        worker.postMessage({ kind: 'solve', generation, request });
      });
      assert.equal(result.status, 'solved'); assert.equal(result.stopReason, 'no_better');
      assert.equal(result.builds[0].metrics.extraArtsCount, 37);
      assert.equal(initialized, generation === 1, 'The second solve must reuse initialized WASM');
      assert.ok(candidates > 0);
      for (const build of result.builds) assert.equal(equipBuild(player, character, game.quartz, build).ok, true);
      console.log(`Shipped browser Worker run ${generation}: ${candidates} improvements, 37 extra arts, ${result.elapsedMs} ms; cached initialization ${!initialized}.`);
    }
  } finally { await worker.terminate(); }
}
