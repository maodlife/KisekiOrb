import handler from 'vinext/server/fetch-handler';
import { withIsolation, z3Response } from '../lib/z3-hosting.ts';
export default {
  async fetch(request: Request, env: Parameters<typeof handler.fetch>[1], ctx: Parameters<typeof handler.fetch>[2]) {
    const z3 = await z3Response(request, env?.ASSETS);
    if (z3) return z3;
    // Worker-first requests need an explicit static-asset branch before routing.
    const path = new URL(request.url).pathname;
    const isAsset = path.startsWith('/_next/static/') || path.startsWith('/vendor/') || ['/favicon.svg', '/og.png'].includes(path);
    const response = withIsolation(isAsset && env?.ASSETS ? await env.ASSETS.fetch(request) : await handler.fetch(request, env, ctx));
    if (new URL(request.url).pathname === '/vendor/orbment-worker.js') response.headers.set('Cache-Control', 'no-cache');
    return response;
  },
};
