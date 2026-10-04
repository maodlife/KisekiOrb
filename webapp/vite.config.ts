import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig, type ViteDevServer } from 'vite';
import { createReadStream } from 'node:fs';
import { createRequire } from 'node:module';
import { ISOLATION_HEADERS } from './lib/z3-hosting.ts';
import hostingConfig from './.openai/hosting.json';

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

const localBindingConfig = {
  main: './server/index.ts',
  assets: { binding: 'ASSETS', run_worker_first: true },
  compatibility_flags: ['nodejs_compat'],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: 'site-creator-d1',
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: 'site-creator-r2',
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    server: { headers: ISOLATION_HEADERS, ...(isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : {}) },
    plugins: [
      { name: 'local-official-z3-wasm', configureServer(server: ViteDevServer) {
        const require = createRequire(import.meta.url);
        server.middlewares.use((request, response, next) => {
          if (request.url?.split('?')[0] !== '/vendor/z3-built.wasm') return next();
          response.setHeader('Content-Type', 'application/wasm');
          for (const [key, value] of Object.entries(ISOLATION_HEADERS)) response.setHeader(key, value);
          createReadStream(require.resolve('z3-solver/build/z3-built.wasm')).pipe(response);
        });
      } },
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: localBindingConfig,
      }),
    ],
  };
});
