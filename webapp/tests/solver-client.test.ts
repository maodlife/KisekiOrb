import assert from 'node:assert/strict';
import test from 'node:test';
import { SolverClient, type SolverClientState, type WorkerPort } from '../lib/solver-client.ts';
import { failedSolveResult } from '../lib/solver.ts';
import type { Build, SolveProgress, SolveRequest, SolverWorkerInput, SolverWorkerOutput } from '../lib/domain.ts';
class FakeWorker implements WorkerPort {
  messages: SolverWorkerInput[] = []; terminated = false;
  onmessage: WorkerPort['onmessage'] = null; onerror: WorkerPort['onerror'] = null;
  postMessage(message: SolverWorkerInput) { this.messages.push(message); }
  terminate() { this.terminated = true; }
  emit(data: SolverWorkerOutput) { this.onmessage?.(new MessageEvent('message', { data })); }
}
const request = { timeoutMs: 2000 } as SolveRequest;
const build: Build = { assignments: { 0: 'q' }, slotFinalLevels: { 0: 1 }, purchases: {}, lineTotals: {}, artWitness: {}, unlockedArts: [],
  metrics: { upgradeSteps: 0, upgradedSlotCount: 0, purchasedCount: 0, purchaseCost: 0, extraArtsCount: 12, ats: 0, spd: 0 } };
const candidate = { ...failedSolveResult(2000, '正在改善'), status: 'solved' as const, stopReason: 'searching' as const, builds: [build] };
const progress: SolveProgress = { phase: 'searching', message: '尝试下一档', elapsedMs: 100, budgetMs: 2000, attempts: 2, target: 13, bestExtraArtsCount: 12 };
function fixture() {
  const workers: FakeWorker[] = []; let state: SolverClientState;
  const client = new SolverClient(() => { const worker = new FakeWorker(); workers.push(worker); return worker; }, next => { state = next; });
  return { client, workers, state: () => state };
}
test('client forwards the time budget, streams candidates and preserves them on cancellation', () => {
  const f = fixture(); f.client.run(request); const worker = f.workers[0]; const sent = worker.messages[0];
  assert.equal(sent.kind, 'solve'); if (sent.kind !== 'solve') return;
  assert.equal(sent.request.timeoutMs, 2000);
  worker.emit({ type: 'progress', generation: sent.generation, progress });
  worker.emit({ type: 'candidate', generation: sent.generation, result: candidate });
  assert.equal(f.state().result?.builds[0].metrics.extraArtsCount, 12);
  assert.equal(f.state().busy, true);
  f.client.cancel(); assert.equal(worker.messages.at(-1)?.kind, 'cancel');
  worker.emit({ type: 'complete', generation: sent.generation, result: { ...candidate, stopReason: 'cancelled' } });
  assert.equal(f.state().busy, false); assert.equal(f.state().result?.builds.length, 1);
  assert.equal(worker.terminated, false);
  f.client.run(request); assert.equal(f.workers.length, 1, 'Initialized Worker should be reused');
  f.client.dispose();
});
test('changing solve inputs invalidates an active run and ignores stale candidates', () => {
  const f = fixture(); f.client.run(request); const old = f.workers[0];
  const sent = old.messages[0]; if (sent.kind !== 'solve') return;
  f.client.reset(); assert.equal(old.terminated, true); f.client.run(request);
  old.emit({ type: 'candidate', generation: sent.generation, result: candidate });
  assert.equal(f.state().result, null); assert.equal(f.workers.length, 2);
  f.client.dispose();
});
test('cancelling initialization stops promptly and reports cancellation rather than no solution', () => {
  const f = fixture(); f.client.run(request); f.client.cancel();
  assert.equal(f.workers[0].terminated, true); assert.equal(f.state().busy, false);
  assert.equal(f.state().result?.status, 'cancelled');
});
test('a Worker error after a candidate preserves that candidate without claiming optimality', () => {
  const f = fixture(); f.client.run(request); const worker = f.workers[0]; const sent = worker.messages[0]; if (sent.kind !== 'solve') return;
  worker.emit({ type: 'candidate', generation: sent.generation, result: candidate });
  worker.emit({ type: 'error', generation: sent.generation, message: '错误' });
  assert.equal(f.state().result?.builds.length, 1); assert.equal(f.state().result?.extraArtsOptimal, false);
  assert.equal(f.state().result?.stopReason, 'solver_unknown'); assert.equal(f.state().busy, false);
});
test('native Worker errors include the browser diagnostic and script location', () => {
  const f = fixture(); f.client.run(request);
  f.workers[0].onerror?.({ message: 'Uncaught ReferenceError: example is not defined', filename: 'https://example.test/api/z3/worker', lineno: 12 } as ErrorEvent);
  assert.match(f.state().result?.message ?? '', /ReferenceError: example is not defined/);
  assert.match(f.state().result?.message ?? '', /\/api\/z3\/worker:12/);
  assert.equal(f.state().busy, false); assert.equal(f.workers[0].terminated, true);
});
