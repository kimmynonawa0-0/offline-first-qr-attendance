import test from 'node:test';
import assert from 'node:assert/strict';
import { hasOrganizerSession, organizerRefreshNeedsPassword } from './attendance-refresh.mjs';

const organizer = { id: '23-02330', role: 'admin' };
const session = { id: organizer.id, token: 'server-session' };

test('organizer refresh reuses the active server session without asking for a password', () => {
  assert.equal(hasOrganizerSession(organizer, session), true);
  assert.equal(organizerRefreshNeedsPassword('web', organizer, session), false);
});

test('web refresh asks for a password only when no matching organizer session exists', () => {
  assert.equal(organizerRefreshNeedsPassword('web', organizer, null), true);
  assert.equal(organizerRefreshNeedsPassword('web', organizer, { ...session, id: 'other' }), true);
  assert.equal(organizerRefreshNeedsPassword('web', { id: 'student', role: 'student' }, null), true);
  assert.equal(organizerRefreshNeedsPassword('native', organizer, null), false);
});
