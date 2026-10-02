import type { SolveRequest, SolveResult } from './domain.ts';
import { solveOrbment } from './solver.ts';

type SolverWorkerScope = {
  onmessage: ((event: MessageEvent<SolveRequest>) => void) | null;
  postMessage: (result: SolveResult) => void;
};

const workerScope = self as unknown as SolverWorkerScope;

workerScope.onmessage = (event) => {
  workerScope.postMessage(solveOrbment(event.data));
};
