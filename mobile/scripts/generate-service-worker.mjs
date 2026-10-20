import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.resolve(scriptDirectory, '../dist');
const excludedFiles = new Set(['metadata.json', 'sw.js']);

async function collectFiles(directory, parent = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.posix.join(parent, entry.name);
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath, relativePath));
    } else if (!excludedFiles.has(entry.name)) {
      files.push({ fullPath, url: `/${relativePath}` });
    }
  }

  return files;
}

const files = await collectFiles(outputDirectory);
if (!files.some((file) => file.url === '/index.html')) {
  throw new Error('Expo web export is missing dist/index.html.');
}

const hash = createHash('sha256');
for (const file of files) {
  hash.update(file.url);
  hash.update(await readFile(file.fullPath));
}

const cacheName = `norwescan-shell-${hash.digest('hex').slice(0, 12)}`;
const assetUrls = JSON.stringify(files.map((file) => file.url));
const serviceWorker = `const CACHE_NAME = '${cacheName}';
const APP_ASSETS = ${assetUrls};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith('norwescan-shell-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    )),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);

  if (request.method !== 'GET' || requestUrl.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => cachedResponse || fetch(request)),
  );
});
`;

await writeFile(path.join(outputDirectory, 'sw.js'), serviceWorker);
console.log(`Generated service worker for ${files.length} exported files.`);
