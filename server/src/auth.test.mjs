import test from 'node:test';
import assert from 'node:assert/strict';
import { canCreateOrganizerEvent, canImportRoster, createOrganizerSessionToken, hashSessionToken, loginClientRoleError, organizerEventDeleteError, organizerSectionAssigneeIds, rosterScopeError } from './auth.mjs';

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
  assert.equal(rosterScopeError(organizer, [{ section:'BSCS-3C' }]), null);
  assert.match(rosterScopeError(organizer, [{ section:'BSCS-3A' }]), /BSCS-3C/);
  assert.equal(canImportRoster({ ...organizer, section:'' }), false);
  assert.equal(canCreateOrganizerEvent({ ...organizer, must_change_password:true }), false);
  assert.equal(canImportRoster({ access_level:'manager', must_change_password:false }), true);
});

test('organizer-created events are shared with active organizers in the same section', () => {
  const organizer = { id:'org-1', access_level:'organizer', section:'BSCS-3C', must_change_password:false };
  const sectionOrganizers = [
    { id:'org-1', access_level:'organizer', section:'BSCS-3C', enabled:true },
    { id:'org-2', access_level:'organizer', section:'BSCS-3C', enabled:true },
    { id:'org-3', access_level:'organizer', section:'BSCS-3C', enabled:false },
    { id:'org-4', access_level:'organizer', section:'BSCS-3A', enabled:true },
    { id:'manager', access_level:'manager', section:'BSCS-3C', enabled:true },
  ];
  assert.deepEqual(organizerSectionAssigneeIds(organizer, sectionOrganizers), ['org-1', 'org-2']);
  assert.deepEqual(organizerSectionAssigneeIds({ ...organizer, section:'' }, sectionOrganizers), ['org-1']);
  assert.equal(organizerSectionAssigneeIds({ ...organizer, must_change_password:true }, sectionOrganizers), null);
});

test('organizers can delete only their own events before any check-in', () => {
  const organizer = { id:'org-1', access_level:'organizer', must_change_password:false };
  assert.equal(organizerEventDeleteError(organizer, { created_by:'org-1' }, 0), null);
  assert.match(organizerEventDeleteError(organizer, { created_by:'org-2' }, 0), /created this event/);
  assert.match(organizerEventDeleteError(organizer, { created_by:'org-1' }, 2), /system manager/);
  assert.match(organizerEventDeleteError({ ...organizer, must_change_password:true }, { created_by:'org-1' }, 0), /temporary password/);
  assert.match(organizerEventDeleteError({ ...organizer, access_level:'manager' }, { created_by:'org-1' }, 0), /event organizer/);
});
