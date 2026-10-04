import { access, mkdir, rename, rmdir } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('dist/client');
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '/KisekiOrb';

// vinext beta puts the assetPrefix into both URLs and disk paths. Pages already
// mounts the artifact at that prefix, so publish _next at the artifact's root.
if (basePath) {
  const prefixedDirectory = path.join(output, basePath.replace(/^\//, ''));
  await mkdir(output, { recursive: true });
  await rename(path.join(prefixedDirectory, '_next'), path.join(output, '_next'));
  await rmdir(prefixedDirectory);
}
await access(path.join(output, 'index.html'));
await access(path.join(output, 'vendor/z3-built.wasm'));
console.log('Pages artifact prepared: static HTML and same-origin Z3 assets.');
