// Official npm package bytes, verified in both Node and browser Workers.
export const Z3_VERSION = '5.2.0';
export const Z3_WASM_SHA256 = '2765f5443a5a3a41aace71a82dd954e3b8c885a7d621b50122b1aede0dc8348a';
// Pages serves the pinned package locally; its Service Worker adds isolation
// headers. Sites continues to use the server routes with the same headers.
const isGitHubPages = process.env.NEXT_PUBLIC_GITHUB_PAGES === 'true';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '/KisekiOrb';
export const Z3_WASM_URL = isGitHubPages ? `${basePath}/vendor/z3-built.wasm` : '/api/z3/wasm';
export const Z3_LOADER_URL = isGitHubPages ? `${basePath}/vendor/z3-built.js` : '/api/z3/loader';
export const SOLVER_WORKER_URL = isGitHubPages ? `${basePath}/vendor/orbment-worker.js` : '/api/z3/worker';
