import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialData, register, login, issueChallenge, verifyChallenge, resetPassword, createEvent, deleteEvent, checkIn, demoSync } from './model.mjs';
import { createRepository, STORAGE_KEY } from './storage.mjs';

const fields = { id: '2026-100', name: 'Test Officer', email: 'test@example.com', password: 'demo password', confirm: 'demo password' };
const admin = { ...fields, role: 'admin' };
const eventFields = { name: 'Assembly', location: 'Main hall', date: '2026-09-23', time: '10:00' };
function adminChallenge(data) {
  return verifyChallenge(issueChallenge(data, { purpose: 'signup', role: 'admin', email: ' TEST@example.com ', code: 'TOKEN' }, 1000), 'TOKEN', 2000);
}

test('student signup and login preserve identity and reject duplicate IDs or password mismatch', () => {
  const data = register(initialData(), 'student', fields);
  assert.equal(login(data, 'student', fields.id, fields.password).name, fields.name);
  assert.throws(() => register(data, 'student', fields), /already registered/);
  assert.throws(() => register(initialData(), 'student', { ...fields, confirm: 'wrong' }), /do not match/);
  assert.throws(() => login(data, 'student', fields.id, 'wrong'), /Invalid credentials/);
});

test('admin signup requires approved email and live, verified signup token', () => {
  const data = initialData();
  assert.throws(() => issueChallenge(data, { purpose: 'signup', role: 'admin', email: 'outsider@example.com', code: 'TOKEN' }), /not approved/);
  assert.throws(() => register(data, 'admin', fields, null), /valid email/);
  const pending = issueChallenge(data, { purpose: 'signup', role: 'admin', email: fields.email, code: 'TOKEN' }, 1000);
  assert.throws(() => register(data, 'admin', fields, pending, 2000), /Verify/);
  assert.throws(() => verifyChallenge(pending, 'wrong', 2000), /Incorrect/);
  assert.throws(() => verifyChallenge(pending, 'TOKEN', pending.expiresAt), /expired/);
  const challenge = adminChallenge(data);
  assert.equal(challenge.code, null);
  assert.throws(() => verifyChallenge(challenge, 'TOKEN', 3000), /Incorrect/);
  const next = register(data, 'admin', fields, challenge, 3000);
  assert.equal(login(next, 'admin', 'TEST@example.com', fields.password).role, 'admin');
  assert.throws(() => register(next, 'admin', fields, challenge, 3000), /already registered/);
  assert.throws(() => register(data, 'admin', fields, challenge, challenge.expiresAt), /expired/);
});

for (const role of ['student', 'admin']) test(`${role} reset changes only password in the selected role`, () => {
  let data = register(initialData(), 'student', fields);
  data = register(data, 'admin', fields, adminChallenge(data), 3000);
  const code = issueChallenge(data, { purpose: 'reset', role, email: fields.email, code: 'RESET' }, 4000);
  assert.throws(() => resetPassword(data, code, 'new', 'new', 5000), /Verify/);
  const verified = verifyChallenge(code, 'RESET', 5000);
  const next = resetPassword(data, verified, ' new password ', ' new password ', 6000);
  assert.throws(() => login(next, role, role === 'admin' ? fields.email : fields.id, fields.password), /Invalid/);
  assert.equal(login(next, role, role === 'admin' ? fields.email : fields.id, ' new password ').id, fields.id);
  const key = role === 'admin' ? 'admins' : 'students';
  const otherKey = role === 'admin' ? 'students' : 'admins';
  assert.deepEqual(next[key].find(a => a.id === fields.id), { ...data[key].find(a => a.id === fields.id), password: ' new password ' });
  assert.deepEqual(next[otherKey], data[otherKey]);
  assert.deepEqual(next.events, data.events);
  assert.deepEqual(next.records, data.records);
  assert.throws(() => resetPassword(data, verified, 'new', 'wrong', 6000), /match/);
  assert.throws(() => resetPassword(data, verified, 'new', 'new', verified.expiresAt), /expired/);
});

test('shared recovery emails require student ID; unknown email cannot request a code', () => {
  let data = register(initialData(), 'student', fields);
  data = register(data, 'student', { ...fields, id: 'another' });
  const request = { purpose: 'reset', role: 'student', email: fields.email, code: 'CODE' };
  assert.throws(() => issueChallenge(data, request), /shared/);
  assert.equal(issueChallenge(data, { ...request, studentId: 'another' }).id, 'another');
  assert.throws(() => issueChallenge(data, { ...request, email: 'missing@example.com' }), /No student/);
});

test('events validate dates and attendance uses event ID, not event name', () => {
  assert.throws(() => createEvent(initialData(), admin, { ...eventFields, date: '2026-02-30' }, 'bad'), /valid date/);
  assert.throws(() => createEvent(initialData(), admin, { ...eventFields, time: '25:00' }, 'bad'), /valid time/);
  let data = createEvent(initialData(), admin, eventFields, 'event-1');
  data = createEvent(data, admin, eventFields, 'event-2');
  data = checkIn(data, admin, 'event-2', fields, 'scan', 'record-1');
  assert.equal(data.events[0].attendees.length, 0);
  assert.equal(data.events[1].attendees.length, 1);
  assert.equal(data.records[0].eventId, 'event-2');
  assert.equal(data.records[0].synced, false);
  assert.throws(() => checkIn(data, admin, 'event-2', fields, 'scan', 'record-2'), /already present/);
});

test('organizer check-in uses session identity and blocks student/anonymous actions', () => {
  const data = createEvent(initialData(), admin, eventFields, 'event');
  const next = checkIn(data, admin, 'event', { id: 'spoof', name: 'Other person' }, 'organizer', 'record');
  assert.equal(next.records[0].studentId, admin.id);
  assert.equal(next.records[0].method, 'organizer');
  assert.throws(() => checkIn(next, admin, 'event', admin, 'scan', 'duplicate'), /already present/);
  for (const user of [null, { ...admin, role: 'student' }]) {
    assert.throws(() => checkIn(data, user, 'event', fields, 'scan', 'invalid'), /Log in as an admin/);
    assert.throws(() => createEvent(data, user, eventFields, 'invalid'), /Log in as an admin/);
    assert.throws(() => deleteEvent(data, user, 'event'), /Log in as an admin/);
  }
});

test('deleting events retains receipts and demo sync only runs online', () => {
  const data = checkIn(createEvent(initialData(), admin, eventFields, 'event'), admin, 'event', fields, 'demo', 'record');
  const deleted = deleteEvent(data, admin, 'event');
  assert.equal(deleted.events.length, 0);
  assert.equal(deleted.records.length, 1);
  assert.throws(() => checkIn(deleted, admin, 'event', fields, 'scan', 'another'), /no longer exists/);
  assert.throws(() => demoSync(deleted, admin, false), /offline/);
  assert.equal(demoSync(deleted, admin, true).records[0].synced, true);
});

test('repository persists a full snapshot and serializes concurrent writes', async () => {
  const values = new Map();
  const storage = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => values.set(key, value) };
  const repository = createRepository(storage);
  await repository.load();
  await Promise.all([
    repository.update(data => createEvent(data, admin, eventFields, 'first')),
    repository.update(data => createEvent(data, admin, eventFields, 'second')),
  ]);
  await repository.update(data => checkIn(data, admin, 'second', admin, 'organizer', 'record'));
  const reloaded = await createRepository(storage).load();
  assert.equal(reloaded.events.length, 2);
  assert.equal(reloaded.events[1].attendees.length, 1);
  assert.equal(reloaded.records.length, 1);
});

test('failed persistence does not advance state and corrupt storage is not overwritten', async () => {
  let raw = JSON.stringify(initialData());
  let fail = false;
  const storage = { getItem: async () => raw, setItem: async (_, value) => { if (fail) throw new Error('Disk full'); raw = value; } };
  const repository = createRepository(storage);
  await repository.load();
  fail = true;
  await assert.rejects(repository.update(data => createEvent(data, admin, eventFields, 'unsaved')), /Disk full/);
  fail = false;
  const next = await repository.update(data => createEvent(data, admin, eventFields, 'saved'));
  assert.deepEqual(next.events.map(e => e.id), ['saved']);
  raw = '{broken';
  await assert.rejects(createRepository(storage).load());
  assert.equal(raw, '{broken');
  assert.equal(STORAGE_KEY, 'norwe-scan-mobile-v1');
});
