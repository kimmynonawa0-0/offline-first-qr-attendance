import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrganizerSessionToken, hashSessionToken, loginClientRoleError } from './auth.mjs';

test('organizer sessions use unpredictable bearer tokens stored only as hashes', () => {
  const first = createOrganizerSessionToken();
  const second = createOrganizerSessionToken();
  assert.equal(first.length, 43);
  assert.notEqual(first, second);
  assert.notEqual(hashSessionToken(first), first);
  assert.equal(hashSessionToken(first), hashSessionToken(first));
});

test('web login clients only receive sessions for their own account roles', () => {
  assert.equal(loginClientRoleError('organizer-web', 'organizer'), null);
  assert.equal(loginClientRoleError('manager-web', 'manager'), null);
  assert.match(loginClientRoleError('organizer-web', 'manager'), /\/manager/);
  assert.match(loginClientRoleError('manager-web', 'organizer'), /system-manager/);
  assert.match(loginClientRoleError('mobile', 'manager'), /scanning app/);
});
