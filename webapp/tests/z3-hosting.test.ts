import assert from 'node:assert/strict';
import test from 'node:test';
import { ISOLATION_HEADERS, withIsolation, z3Response } from '../lib/z3-hosting.ts';
import { Z3_WASM_SHA256 } from '../lib/z3-assets.ts';
test('server responses explicitly enable browser isolation while preserving body and status', async () => {
  const response = withIsolation(new Response('body', { status: 404, headers: { 'Content-Type': 'text/html' } }));
  assert.equal(response.status, 404); assert.equal(await response.text(), 'body');
  for (const [key, value] of Object.entries(ISOLATION_HEADERS)) assert.equal(response.headers.get(key), value);
});
test('WASM is streamed from the pinned official package on the same origin', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async input => { assert.equal(input, 'https://cdn.jsdelivr.net/npm/z3-solver@5.2.0/build/z3-built.wasm'); return new Response(new Uint8Array([1, 2, 3])); };
    const response = await z3Response(new Request('https://example.test/vendor/z3-built.wasm'));
    assert.ok(response); assert.equal(response.headers.get('Content-Type'), 'application/wasm');
    assert.equal(response.headers.get('Cross-Origin-Embedder-Policy'), 'require-corp');
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
    const runtime = await z3Response(new Request('https://example.test/api/z3/runtime'));
    assert.equal((await runtime!.json() as { sha256: string }).sha256, Z3_WASM_SHA256);
  } finally { globalThis.fetch = originalFetch; }
});
test('unsupported methods are rejected and ordinary routes delegate to the application', async () => {
  assert.equal((await z3Response(new Request('https://example.test/vendor/z3-built.wasm', { method: 'POST' })))?.status, 405);
  assert.equal(await z3Response(new Request('https://example.test/')), null);
});
