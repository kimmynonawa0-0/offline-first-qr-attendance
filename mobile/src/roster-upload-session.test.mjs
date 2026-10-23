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

test('PWA roster upload obtains a fresh organizer session when restored without a token', async () => {
  const result = await authorizeRosterUpload({
    user: organizer, session: null, password: 'secret', apiUrl: 'https://api.test', online: true, isWeb: true,
    reauthenticate: async (user, password, apiUrl) => {
      assert.equal(user, organizer);
      assert.equal(password, 'secret');
      assert.equal(apiUrl, 'https://api.test');
      return { sessionToken: 'fresh-server-session' };
    },
  });
  assert.deepEqual(result, { id: organizer.id, token: 'fresh-server-session' });
});

test('native roster upload without its server session does not request a password fallback', async () => {
  await assert.rejects(authorizeRosterUpload({ user: organizer, online: true, isWeb: false }), /Sign in online/);
});
