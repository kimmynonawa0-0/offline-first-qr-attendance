import test from 'node:test';
import assert from 'node:assert/strict';
import { initialData } from './model.mjs';
import { persistWebOrganizerSession, persistWebSession, restoreWebOrganizerSession, restoreWebSession, WEB_ORGANIZER_SESSION_KEY } from './web-session.mjs';

function browserStorage() {
  const values = new Map();
  return {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => value === null ? values.delete(key) : values.set(key, value),
  };
}

test('web session stores only the account ID and role, then restores the local profile', async () => {
  const storage = browserStorage();
  const data = initialData();
  data.students.push({ id: '00123', name: 'Student', section: 'BSCS-3C' });

  await persistWebSession(storage, { id: '00123', role: 'student', name: 'Ignored', password: 'not stored' });

  assert.deepEqual(JSON.parse(await storage.getItem('norwescan-active-user')), { id: '00123', role: 'student' });
  assert.equal(restoreWebSession(data, await storage.getItem('norwescan-active-user')).name, 'Student');
});

test('web session restores the required password-change route and rejects stale markers', async () => {
  const storage = browserStorage();
  const data = initialData();
  data.students.push({ id: '00123', name: 'Student', section: 'BSCS-3C', mustChangePassword: true });
  await persistWebSession(storage, { id: '00123', role: 'student' });

  assert.equal(restoreWebSession(data, await storage.getItem('norwescan-active-user')).mustChangePassword, true);
  await storage.setItem('norwescan-active-user', '{bad json');
  assert.equal(restoreWebSession(data, await storage.getItem('norwescan-active-user')), null);
  await storage.setItem('norwescan-active-user', JSON.stringify({ id: 'missing', role: 'student' }));
  assert.equal(restoreWebSession(data, await storage.getItem('norwescan-active-user')), null);
});

test('web logout clears only the remembered session marker', async () => {
  const storage = browserStorage();
  await persistWebSession(storage, { id: '23-02330', role: 'admin' });

  await persistWebSession(storage, null);

  assert.equal(await storage.getItem('norwescan-active-user'), null);
});

test('web organizer session survives reload and is scoped to the remembered organizer', async () => {
  const storage = browserStorage();
  const user = { id: '23-02330', role: 'admin' };
  await persistWebOrganizerSession(storage, { ...user, token: 'server-token' });

  assert.deepEqual(restoreWebOrganizerSession(await storage.getItem(WEB_ORGANIZER_SESSION_KEY), user), {
    id: user.id, token: 'server-token',
  });
  assert.equal(restoreWebOrganizerSession(await storage.getItem(WEB_ORGANIZER_SESSION_KEY), { id: 'other', role: 'admin' }), null);
  assert.equal(restoreWebOrganizerSession(await storage.getItem(WEB_ORGANIZER_SESSION_KEY), { ...user, role: 'student' }), null);
});

test('web organizer logout clears the stored server token', async () => {
  const storage = browserStorage();
  await persistWebOrganizerSession(storage, { id: '23-02330', token: 'server-token' });

  await persistWebOrganizerSession(storage, null);

  assert.equal(await storage.getItem(WEB_ORGANIZER_SESSION_KEY), null);
});
