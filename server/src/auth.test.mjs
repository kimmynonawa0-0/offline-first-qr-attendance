import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrganizerSessionToken, hashSessionToken } from './auth.mjs';

test('organizer sessions use unpredictable bearer tokens stored only as hashes', () => {
  const first = createOrganizerSessionToken();
  const second = createOrganizerSessionToken();
  assert.equal(first.length, 43);
  assert.notEqual(first, second);
  assert.notEqual(hashSessionToken(first), first);
  assert.equal(hashSessionToken(first), hashSessionToken(first));
});
