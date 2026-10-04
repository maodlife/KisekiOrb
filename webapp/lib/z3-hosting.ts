import { Z3_VERSION, Z3_WASM_SHA256, Z3_WASM_URL } from './z3-assets.ts';
export const ISOLATION_HEADERS: Record<string, string> = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'cross-origin-isolated=(self)',
  'X-Content-Type-Options': 'nosniff',
};
export function withIsolation(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(ISOLATION_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
export async function z3Response(request: Request): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path !== Z3_WASM_URL && path !== '/api/z3/runtime') return null;
  if (!['GET', 'HEAD'].includes(request.method)) return withIsolation(new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } }));
  if (path === '/api/z3/runtime') return withIsolation(Response.json({ version: Z3_VERSION, sha256: Z3_WASM_SHA256, headers: ISOLATION_HEADERS }));
  const upstream = await fetch(`https://cdn.jsdelivr.net/npm/z3-solver@${Z3_VERSION}/build/z3-built.wasm`, {
    cf: { cacheEverything: true, cacheTtl: 86400 },
  });
  if (!upstream.ok) return withIsolation(new Response('Z3 暂时无法下载，请稍后重试。', { status: 502 }));
  return withIsolation(new Response(request.method === 'HEAD' ? null : upstream.body, { headers: {
    'Content-Type': 'application/wasm', 'Cache-Control': 'public, max-age=86400',
  } }));
}
