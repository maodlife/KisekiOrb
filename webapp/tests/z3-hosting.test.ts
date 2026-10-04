import assert from 'node:assert/strict';
import test from 'node:test';
import { ISOLATION_HEADERS, withIsolation, z3Response } from '../lib/z3-hosting.ts';
import { SOLVER_WORKER_URL, Z3_LOADER_URL, Z3_WASM_SHA256, Z3_WASM_URL } from '../lib/z3-assets.ts';
test('server responses explicitly enable browser isolation while preserving body and status', async () => {
  const response = withIsolation(new Response('body', { status: 404, headers: { 'Content-Type': 'text/html' } }));
  assert.equal(response.status, 404); assert.equal(await response.text(), 'body');
  for (const [key, value] of Object.entries(ISOLATION_HEADERS)) assert.equal(response.headers.get(key), value);
});
test('WASM is streamed from the pinned official package on the same origin', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async input => { assert.equal(input, 'https://cdn.jsdelivr.net/npm/z3-solver@5.2.0/build/z3-built.wasm'); return new Response(new Uint8Array([1, 2, 3])); };
    const response = await z3Response(new Request(`https://example.test${Z3_WASM_URL}`));
    assert.ok(response); assert.equal(response.headers.get('Content-Type'), 'application/wasm');
    assert.equal(response.headers.get('Cross-Origin-Embedder-Policy'), 'require-corp');
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
    const runtime = await z3Response(new Request('https://example.test/api/z3/runtime'));
    assert.equal((await runtime!.json() as { sha256: string }).sha256, Z3_WASM_SHA256);
  } finally { globalThis.fetch = originalFetch; }
});
test('unsupported methods are rejected and ordinary routes delegate to the application', async () => {
  assert.equal((await z3Response(new Request(`https://example.test${Z3_WASM_URL}`, { method: 'POST' })))?.status, 405);
  assert.equal(await z3Response(new Request('https://example.test/')), null);
});
test('Worker and pthread loader routes restore isolation even when static hosting omits it', async () => {
  for (const [route, assetPath] of [[SOLVER_WORKER_URL, '/vendor/orbment-worker.js'], [Z3_LOADER_URL, '/vendor/z3-built.js']]) {
    const assets = { fetch: async (request: Request) => {
      assert.equal(new URL(request.url).pathname, assetPath);
      // Model the production asset fast path: no COEP and a stale MIME header.
      return new Response('self.onmessage = () => {};', { headers: { 'Content-Type': 'text/plain' } });
    } };
    const response = await z3Response(new Request(`https://example.test${route}`), assets);
    assert.equal(response?.status, 200);
    assert.equal(response?.headers.get('Cross-Origin-Embedder-Policy'), 'require-corp');
    assert.match(response?.headers.get('Content-Type') ?? '', /application\/javascript/);
    assert.match(await response!.text(), /self.onmessage/);
    const head = await z3Response(new Request(`https://example.test${route}`, { method: 'HEAD' }), assets);
    assert.equal(await head!.text(), '');
  }
});
test('missing Worker assets fail explicitly instead of returning an HTML fallback as JavaScript', async () => {
  assert.equal((await z3Response(new Request(`https://example.test${SOLVER_WORKER_URL}`)))?.status, 503);
  assert.equal((await z3Response(new Request(`https://example.test${SOLVER_WORKER_URL}`), { fetch: async () => new Response('<html>404</html>', { status: 404 }) }))?.status, 502);
});
