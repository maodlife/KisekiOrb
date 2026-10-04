import type { SolveProgress, SolveRequest, SolveResult, SolverWorkerInput, SolverWorkerOutput } from './domain.ts';
import { failedSolveResult } from './solver.ts';
export type WorkerPort = {
  postMessage: (message: SolverWorkerInput) => void;
  terminate: () => void;
  onmessage: ((event: MessageEvent<SolverWorkerOutput>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
};
export type SolverClientState = { result: SolveResult | null; progress: SolveProgress | null; busy: boolean; cancelling: boolean };
const emptyState = (): SolverClientState => ({ result: null, progress: null, busy: false, cancelling: false });

// Reuse the initialized Worker between solves and ignore obsolete generations.
export class SolverClient {
  private worker: WorkerPort | null = null;
  private generation = 0;
  private state = emptyState();
  private budgetMs = 10_000;
  private createWorker: () => WorkerPort;
  private onChange: (state: SolverClientState) => void;
  constructor(createWorker: () => WorkerPort, onChange: (state: SolverClientState) => void) {
    this.createWorker = createWorker; this.onChange = onChange;
  }
  private update(patch: Partial<SolverClientState>) { this.state = { ...this.state, ...patch }; this.onChange(this.state); }
  private fail(message: string) {
    this.worker?.terminate(); this.worker = null;
    const best = this.state.result;
    this.update({ busy: false, cancelling: false, progress: null, result: best?.builds.length
      ? { ...best, stopReason: 'solver_unknown', extraArtsOptimal: false, message: `${message} 已保留当前最佳方案。` }
      : failedSolveResult(this.budgetMs, message) });
  }
  run(request: SolveRequest) {
    if (this.state.busy) return;
    this.budgetMs = request.timeoutMs ?? 10_000;
    const generation = ++this.generation;
    this.update({ ...emptyState(), busy: true, progress: { phase: 'initializing', message: '正在准备 Z3…', elapsedMs: 0, budgetMs: this.budgetMs, attempts: 0, target: 0, bestExtraArtsCount: null } });
    try {
      const worker = this.worker ??= this.createWorker();
      worker.onmessage = ({ data }) => {
        if (worker !== this.worker || data.generation !== this.generation || !this.state.busy) return;
        if (data.type === 'progress') this.update({ progress: data.progress });
        if (data.type === 'candidate') this.update({ result: data.result });
        if (data.type === 'complete') this.update({ result: data.result, progress: null, busy: false, cancelling: false });
        if (data.type === 'error') this.fail(data.message);
      };
      worker.onerror = event => {
        if (worker !== this.worker || !this.state.busy) return;
        const detail = event.message?.trim();
        const file = event.filename ? new URL(event.filename, 'https://localhost').pathname : '';
        const location = file ? `（${file}${event.lineno ? `:${event.lineno}` : ''}）` : '';
        this.fail(detail ? `后台求解器运行失败：${detail}${location}` : '后台求解器脚本加载失败，请刷新页面后重试。');
      };
      worker.postMessage({ kind: 'solve', generation, request });
    } catch (error) { this.fail(error instanceof Error ? error.message : '无法启动后台求解器，请重试。'); }
  }
  cancel() {
    if (!this.state.busy || this.state.cancelling) return;
    if (this.state.progress?.phase === 'initializing') {
      this.worker?.terminate(); this.worker = null; this.generation++;
      const result = failedSolveResult(this.budgetMs, '已取消初始化，尚未开始求解。');
      this.update({ busy: false, cancelling: false, progress: null, result: { ...result, status: 'cancelled', stopReason: 'cancelled' } });
    } else { this.update({ cancelling: true }); this.worker?.postMessage({ kind: 'cancel' }); }
  }
  reset() {
    if (this.state.busy) { this.worker?.terminate(); this.worker = null; }
    this.generation++; this.update(emptyState());
  }
  dispose() { this.worker?.terminate(); this.worker = null; this.generation++; }
}
