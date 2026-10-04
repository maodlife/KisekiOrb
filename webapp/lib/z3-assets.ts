// Official npm package bytes, verified in both Node and browser Workers.
export const Z3_VERSION = '5.2.0';
export const Z3_WASM_SHA256 = '2765f5443a5a3a41aace71a82dd954e3b8c885a7d621b50122b1aede0dc8348a';
// Runtime routes must pass through the server: static hosting can bypass the
// fetch handler, dropping the COEP header required on every Worker script.
export const Z3_WASM_URL = '/api/z3/wasm';
export const Z3_LOADER_URL = '/api/z3/loader';
export const SOLVER_WORKER_URL = '/api/z3/worker';
