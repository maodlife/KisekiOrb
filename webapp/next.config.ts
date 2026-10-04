import type { NextConfig } from 'next';

const isGitHubPages = process.env.NEXT_PUBLIC_GITHUB_PAGES === 'true';

const nextConfig: NextConfig = isGitHubPages
  ? {
      output: 'export',
      // vinext beta's exporter renders routes at /. Keep that route while
      // prefixing assets; Pages mounts the exported directory at its base path.
      assetPrefix: process.env.NEXT_PUBLIC_BASE_PATH ?? '/KisekiOrb',
      trailingSlash: true,
    }
  : {};

export default nextConfig;
