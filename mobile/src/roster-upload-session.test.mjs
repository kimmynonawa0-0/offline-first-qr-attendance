import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeRosterUpload } from './roster-upload-session.mjs';

const organizer = { id: '23-02330', role: 'admin' };

test('roster upload requires an online organizer session', async () => {
  await assert.rejects(authorizeRosterUpload({ user: organizer, online: false, isWeb: true }), /Connect to the internet/);
  await assert.rejects(authorizeRosterUpload({ user: { id: '001', role: 'student' }, online: true, isWeb: true }), /organizer/);
});

test('roster upload reuses a matching server session', async () => {
  const session = { id: organizer.id, token: 'server-session' };
  const result = await authorizeRosterUpload({ user: organizer, session, online: true, isWeb: true });
  assert.equal(result, session);
});

test('roster upload never asks for a second password when the server session is missing', async () => {
  await assert.rejects(authorizeRosterUpload({ user: organizer, online: true, session: null }), /session is unavailable.*Log out.*sign in online again/);
});
