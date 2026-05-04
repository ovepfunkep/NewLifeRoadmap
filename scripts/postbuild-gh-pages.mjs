import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const distIndex = path.join(root, 'dist', 'index.html');

if (!fs.existsSync(distIndex)) {
  console.error('postbuild: dist/index.html not found');
  process.exit(1);
}

const html = fs.readFileSync(distIndex, 'utf8');
if (html.includes('main.tsx') || html.includes('/src/main')) {
  console.error(
    'postbuild: dist/index.html still references dev entry (src/main). Use output of vite build for deploy.',
  );
  process.exit(1);
}

fs.copyFileSync(distIndex, path.join(root, 'dist', '404.html'));
console.log('postbuild: dist/404.html synced from index; production index OK');
