import { init } from 'z3-solver/build/browser.js';
import { solveOrbment } from './solver.ts';
import { Z3_LOADER_URL, Z3_WASM_SHA256, Z3_WASM_URL } from './z3-assets.ts';
import type { SolveProgress, SolverWorkerInput, SolverWorkerOutput } from './domain.ts';

const scope = self as unknown as {
  crossOriginIsolated: boolean; location: { href: string };
  importScripts: (...urls: string[]) => void;
  onmessage: ((event: MessageEvent<SolverWorkerInput>) => void) | null;
  postMessage: (message: SolverWorkerOutput) => void;
};
let apiPromise: ReturnType<typeof init> | undefined;
let controller: AbortController | undefined;
let activeGeneration: number | undefined;
const sendProgress = (progress: SolveProgress) => scope.postMessage({ type: 'progress', generation: activeGeneration!, progress });
async function initialize(budgetMs: number) {
  const progress = (message: string) => sendProgress({ phase: 'initializing', message, elapsedMs: 0, budgetMs, attempts: 0, target: 0, bestExtraArtsCount: null });
  if (!scope.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') throw new Error('当前页面未启用跨源隔离，请在独立标签页打开正式站点后重试。');
  progress('首次下载官方 Z3（约 35 MB），初始化不占尝试时间。');
  const response = await fetch(Z3_WASM_URL);
  if (!response.ok) throw new Error(`Z3 下载失败（${response.status}），请重试。`);
  const wasmBinary = new Uint8Array(await response.arrayBuffer());
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', wasmBinary))).map(x => x.toString(16).padStart(2, '0')).join('');
  if (hash !== Z3_WASM_SHA256) throw new Error('Z3 文件完整性校验失败，请刷新页面后重试。');
  progress('正在初始化 Z3，完成后开始计算尝试时间。');
  scope.importScripts(Z3_LOADER_URL);
  return init({ wasmBinary, locateFile: file => new URL(`/vendor/${file}`, scope.location.href).href,
    mainScriptUrlOrBlob: new URL(Z3_LOADER_URL, scope.location.href).href });
}
scope.onmessage = async ({ data }) => {
  if (data.kind === 'cancel') { controller?.abort(); return; }
  if (controller) return;
  controller = new AbortController(); activeGeneration = data.generation;
  try {
    const api = await (apiPromise ??= initialize(data.request.timeoutMs ?? 10_000));
    const result = await solveOrbment(api, data.request, { signal: controller.signal, onProgress: sendProgress,
      onCandidate: result => scope.postMessage({ type: 'candidate', generation: data.generation, result }) });
    scope.postMessage({ type: 'complete', generation: data.generation, result });
  } catch (error) {
    apiPromise = undefined;
    scope.postMessage({ type: 'error', generation: data.generation, message: error instanceof Error ? error.message : '求解器运行失败，请重试。' });
  } finally { controller = undefined; activeGeneration = undefined; }
};
