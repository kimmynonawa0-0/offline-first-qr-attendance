import test from 'node:test';
import assert from 'node:assert/strict';
import { corsDecision, parseWebOrigins } from './cors.mjs';

test('only explicitly configured exact HTTPS origins are allowed', () => {
  const allowed = parseWebOrigins('https://norwescan-pwa.example, https://test.example:8443');

  assert.equal(corsDecision('https://norwescan-pwa.example', allowed).allowed, true);
  assert.equal(corsDecision('https://test.example:8443', allowed).allowed, true);
  assert.equal(corsDecision('http://localhost:4173', allowed).allowed, false);
  assert.equal(corsDecision('https://attacker.example', allowed).allowed, false);
});

test('local browser origins are accepted only when explicitly added for development', () => {
  const allowed = parseWebOrigins('http://localhost:8081,http://127.0.0.1:4173');

  assert.equal(corsDecision('http://localhost:8081', allowed).allowed, true);
  assert.equal(corsDecision('http://127.0.0.1:4173', allowed).allowed, true);
  assert.equal(corsDecision('http://localhost:4173', allowed).allowed, false);
});

test('allowed origins receive the required JSON API preflight headers', () => {
  const decision = corsDecision('https://norwescan-pwa.example', parseWebOrigins('https://norwescan-pwa.example'));

  assert.deepEqual(decision.headers, {
    'Access-Control-Allow-Origin': 'https://norwescan-pwa.example',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  });
});

test('requests without browser Origin headers remain usable by native clients', () => {
  assert.deepEqual(corsDecision(undefined, parseWebOrigins()), { allowed: true, headers: {} });
});

test('invalid or path-based origins fail configuration instead of widening access', () => {
  assert.throws(() => parseWebOrigins('not a URL'), /Invalid WEB_ORIGINS/);
  assert.throws(() => parseWebOrigins('https://example.com/path'), /exact HTTP\(S\) origins/);
  assert.throws(() => parseWebOrigins('*'), /Invalid WEB_ORIGINS/);
});
