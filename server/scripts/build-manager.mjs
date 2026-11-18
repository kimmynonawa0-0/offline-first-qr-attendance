import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const result = await build({
  absWorkingDir: root,
  entryPoints: ['manager/main.jsx'],
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  write: false,
});
const script = result.outputFiles[0].text.replaceAll('</script>', '<\\/script>');
const template = await readFile(path.join(root, 'manager/template.html'), 'utf8');
const html = template.replace('<!-- APP_BUNDLE -->', `<script>${script}</script>`);
await writeFile(path.join(root, 'public/manager.html'), html);
console.log(`Built public/manager.html (${(html.length / 1024).toFixed(1)} KiB).`);
