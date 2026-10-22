const testFiles = [
  '../src/model.test.mjs',
  '../src/sqlite-storage.test.mjs',
  '../src/remote-sync.test.mjs',
  '../src/offline-auth.test.mjs',
  '../src/web-session.test.mjs',
  '../src/web-auth.test.mjs',
  '../src/web-local-data.test.mjs',
  '../src/web-api-url.test.mjs',
];

for (const testFile of testFiles) {
  await import(new URL(testFile, import.meta.url));
}
