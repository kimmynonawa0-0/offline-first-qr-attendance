import test from 'node:test';
import assert from 'node:assert/strict';
import { reauthenticateOrganizer } from './web-auth.mjs';

test('web reauthentication accepts an organizer and returns its fresh session', async () => {
  const user = { id: '23-02330', role: 'admin' };
  const result = await reauthenticateOrganizer(user, 'password', 'https://api.test', async (id, password, apiUrl) => {
    assert.equal(id, user.id);
    assert.equal(password, 'password');
    assert.equal(apiUrl, 'https://api.test');
    return { id, role: 'admin', accessLevel: 'organizer', sessionToken: 'fresh-token' };
  });

  assert.equal(result.sessionToken, 'fresh-token');
});

test('web reauthentication rejects students, manager accounts, and missing passwords', async () => {
  await assert.rejects(
    reauthenticateOrganizer({ id: '00123', role: 'student' }, 'password', 'https://api.test'),
    /Log in as an organizer/,
  );
  await assert.rejects(
    reauthenticateOrganizer({ id: '23-02330', role: 'admin' }, '', 'https://api.test'),
    /Enter your organizer password/,
  );
  await assert.rejects(
    reauthenticateOrganizer({ id: 'manager', role: 'admin' }, 'password', 'https://api.test', async () => ({
      id: 'manager', role: 'admin', accessLevel: 'manager', sessionToken: 'token',
    })),
    /not an event organizer/,
  );
});
