import test from 'node:test';
import assert from 'node:assert/strict';
import { canCreateOrganizerEvent, canImportRoster, createOrganizerSessionToken, hashSessionToken, loginClientRoleError, organizerEventAssigneeIds, rosterScopeError } from './auth.mjs';

test('organizer sessions use unpredictable bearer tokens stored only as hashes', () => {
  const first = createOrganizerSessionToken();
  const second = createOrganizerSessionToken();
  assert.equal(first.length, 43);
  assert.notEqual(first, second);
  assert.notEqual(hashSessionToken(first), first);
  assert.equal(hashSessionToken(first), hashSessionToken(first));
});

test('system managers alone can sign in to the management website', () => {
  assert.match(loginClientRoleError('organizer-web', 'organizer'), /website is unavailable/);
  assert.equal(loginClientRoleError('manager-web', 'manager'), null);
  assert.match(loginClientRoleError('organizer-web', 'manager'), /website is unavailable/);
  assert.match(loginClientRoleError('manager-web', 'organizer'), /system-manager/);
  assert.match(loginClientRoleError('mobile', 'manager'), /scanning app/);
});

test('organizer app uploads are scoped to its section and available after password setup', () => {
  const organizer = { access_level:'organizer', section:'BSCS-3C', must_change_password:false };
  assert.equal(canImportRoster(organizer), true);
  assert.equal(canCreateOrganizerEvent(organizer), true);
  assert.equal(canCreateOrganizerEvent({ access_level:'manager', must_change_password:false }), false);
  assert.deepEqual(organizerEventAssigneeIds({ ...organizer, id:'org-1' }, ['org-2']), ['org-2','org-1']);
  assert.equal(organizerEventAssigneeIds({ ...organizer, id:'org-1' }, [' org-2 ', 'org-2']), null);
  assert.equal(rosterScopeError(organizer, [{ section:'BSCS-3C' }]), null);
  assert.match(rosterScopeError(organizer, [{ section:'BSCS-3A' }]), /BSCS-3C/);
  assert.equal(canImportRoster({ ...organizer, section:'' }), false);
  assert.equal(canCreateOrganizerEvent({ ...organizer, must_change_password:true }), false);
  assert.equal(canImportRoster({ access_level:'manager', must_change_password:false }), true);
});
