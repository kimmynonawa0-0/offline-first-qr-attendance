import test from 'node:test';
import assert from 'node:assert/strict';
import { cacheRemoteAdminPassword, cacheRemoteStudent, initialData } from './model.mjs';
import { activeUserMarker, authenticateOffline, getOfflineCredential, persistActiveUser, restoreRememberedUser, saveOfflineCredential } from './offline-auth.mjs';

function secureStore() {
  const values = new Map();
  return {
    getItemAsync: async key => values.get(key) ?? null,
    setItemAsync: async (key, value) => values.set(key, value),
    deleteItemAsync: async key => values.delete(key),
  };
}

test('one successful online sign-in provisions device-only student and organizer credentials', async () => {
  const store = secureStore();
  let data = cacheRemoteStudent(initialData(), { id: '00123', name: 'Student', section: 'BSCS-3C', role: 'student' });
  data = cacheRemoteAdminPassword(data, '23-02330', undefined, { name: 'Organizer', section: 'BSCS-3C' });
  await saveOfflineCredential(store, 'student', '00123', 'student-secret');
  await saveOfflineCredential(store, 'admin', '23-02330', 'organizer-secret');
  assert.equal(data.students[0].password, undefined);
  assert.equal(data.admins[0].password, undefined);
  assert.equal((await authenticateOffline(data, '00123', 'student-secret', store)).role, 'student');
  assert.equal((await authenticateOffline(data, '23-02330', 'organizer-secret', store)).role, 'admin');
  assert.equal(await getOfflineCredential(store, 'student', '00123'), 'student-secret');
});

test('offline login rejects roster-only accounts, wrong passwords, and ambiguous IDs', async () => {
  const store = secureStore();
  const data = initialData();
  data.students.push({ id: '00123', name: 'Roster Student', section: 'BSCS-3C' });
  await assert.rejects(authenticateOffline(data, '00123', 'BSCS-3C', store), /has not signed in online/);
  await saveOfflineCredential(store, 'student', '00123', 'online-password');
  await assert.rejects(authenticateOffline(data, '00123', 'BSCS-3C', store), /Invalid student ID or password/);
  data.admins.push({ id: '00123', name: 'Conflict' });
  await assert.rejects(authenticateOffline(data, '00123', 'online-password', store), /Invalid student ID or password/);
});

test('active session persists only ID and role and restores the correct role profile', () => {
  const data = initialData();
  data.students.push({ id: '00123', name: 'Student', section: 'BSCS-3C' });
  const marker = activeUserMarker({ id: '00123', role: 'student', name: 'ignored', password: 'never persist this' });
  assert.deepEqual(marker, { id: '00123', role: 'student' });
  assert.equal(restoreRememberedUser(data, marker).name, 'Student');
  assert.equal(restoreRememberedUser(data, { id: '23-02330', role: 'admin' }).role, 'admin');
  assert.equal(restoreRememberedUser(data, { id: '00123', role: 'admin' }), null);
  assert.equal(restoreRememberedUser(data, { id: 'missing', role: 'student' }), null);
});

test('explicit logout clears only the active user marker and retains protected offline credentials', async () => {
  const store = secureStore();
  await saveOfflineCredential(store, 'student', '00123', 'student-secret');
  await persistActiveUser(store, { id: '00123', role: 'student', name: 'Student', password: 'not stored here' });
  assert.deepEqual(JSON.parse(await store.getItemAsync('norwescan-active-user')), { id: '00123', role: 'student' });
  await persistActiveUser(store, null);
  assert.equal(await store.getItemAsync('norwescan-active-user'), null);
  assert.equal(await getOfflineCredential(store, 'student', '00123'), 'student-secret');
});
