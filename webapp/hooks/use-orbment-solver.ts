'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SolverClient, type SolverClientState } from '../lib/solver-client.ts';
import type { SolveRequest } from '../lib/domain.ts';
import { SOLVER_WORKER_URL } from '../lib/z3-assets.ts';
export function useOrbmentSolver() {
  const [state, setState] = useState<SolverClientState>({ result: null, progress: null, busy: false, cancelling: false });
  const [elapsedMs, setElapsedMs] = useState(0);
  const client = useRef<SolverClient | null>(null);
  const started = useRef(0);
  const lastProgress = useRef<SolverClientState['progress']>(null);
  const getClient = useCallback(() => {
    if (!client.current) client.current = new SolverClient(() => {
      if (typeof Worker === 'undefined') throw new Error('当前浏览器不支持后台求解，请使用现代浏览器。');
      if (!window.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') throw new Error('当前页面无法运行 Z3。请在独立标签页打开本站，并刷新页面后重试。');
      return new Worker(SOLVER_WORKER_URL);
    }, next => {
      if (next.progress?.phase === 'searching' && next.progress !== lastProgress.current) started.current = performance.now() - next.progress.elapsedMs;
      lastProgress.current = next.progress;
      setState(next);
    });
    return client.current;
  }, []);
  useEffect(() => () => client.current?.dispose(), []);
  const phase = state.progress?.phase;
  useEffect(() => {
    if (phase !== 'searching') return;
    const timer = window.setInterval(() => setElapsedMs(Math.max(0, performance.now() - started.current)), 100);
    return () => window.clearInterval(timer);
  }, [phase]);
  const run = useCallback((request: SolveRequest) => { setElapsedMs(0); getClient().run(request); }, [getClient]);
  const cancel = useCallback(() => client.current?.cancel(), []);
  const reset = useCallback(() => { client.current?.reset(); setState({ result: null, progress: null, busy: false, cancelling: false }); }, []);
  return { ...state, elapsedMs: state.progress ? Math.min(state.progress.budgetMs, Math.max(elapsedMs, state.progress.elapsedMs)) : state.result?.elapsedMs ?? 0, run, cancel, reset };
}
