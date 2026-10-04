import { after } from 'node:test';
import { init, killThreads } from 'z3-solver';
import { solveOrbment as solve, type SolveOptions } from '../lib/solver.ts';
import type { SolveRequest } from '../lib/domain.ts';
const api = await init();
after(async () => { await killThreads(api.em); });
export function solveOrbment(request: SolveRequest, options: SolveOptions = {}) { return solve(api, request, options); }
