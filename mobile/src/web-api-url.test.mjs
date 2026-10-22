import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProductionApiUrl } from './web-api-url.mjs';

test('production web API accepts and normalizes a public HTTPS origin', () => {
  assert.equal(validateProductionApiUrl(' https://api.example.test/ '), 'https://api.example.test');
});

test('production web API requires a configured HTTPS base URL', () => {
  assert.throws(() => validateProductionApiUrl(''), /Set EXPO_PUBLIC_API_URL/);
  assert.throws(() => validateProductionApiUrl('http://localhost:3000'), /must use HTTPS/);
});

test('production web API rejects endpoint paths and embedded credentials', () => {
  assert.throws(() => validateProductionApiUrl('https://api.example.test/health'), /API root URL/);
  assert.throws(() => validateProductionApiUrl('https://user:pass@api.example.test'), /API root URL/);
});
