import test from 'node:test';
import assert from 'node:assert/strict';
import { changeStudentPasswordRemotely, downloadStudentAttendance, loginStudentRemotely, markSynced, syncToServer, uploadRosterToServer } from './remote-sync.mjs';

test('remote sync sends only pending receipts and confirms only accepted IDs', async () => {
  const data = { students: [{ id: '1', name: 'A', section: 'S', password: 'private' }],
    events: [{ id: 'e', name: 'Event', attendees: [{ id: '1' }] }],
    records: [{ id: 'r1', synced: false }, { id: 'r2', synced: true }] };
  let sent;
  const fetchImpl = async (_, options) => {
    sent = JSON.parse(options.body);
    return { ok: true, json: async () => ({ acceptedRecordIds: ['r1'], conflictRecordIds: [] }) };
  };
  const result = await syncToServer(data, { id: '23-02330', role: 'admin' }, 'secret', 'http://localhost:3000/', fetchImpl);
  assert.deepEqual(sent.records.map(r => r.id), ['r1']);
  assert.equal(sent.students[0].password, undefined);
  assert.equal(sent.events[0].attendees, undefined);
  assert.deepEqual(markSynced(data, result.acceptedRecordIds).records.map(r => r.synced), [true, true]);
  assert.equal(data.records[0].synced, false);
});

test('failed server response leaves local data untouched', async () => {
  const data = { students: [], events: [], records: [{ id: 'r1', synced: false }] };
  await assert.rejects(syncToServer(data, { id: 'a', role: 'admin' }, 'secret', 'http://localhost:3000',
    async () => ({ ok: false, json: async () => ({ error: 'Wrong password.' }) })), /Wrong password/);
  assert.equal(data.records[0].synced, false);
});

test('roster upload requires organizer role and confirms counts from the remote API', async () => {
  let sent;
  const result = await uploadRosterToServer([{ id: '001', name: 'A', section: 'S' }], { id: 'admin', role: 'admin' }, 'pw', 'https://api.test',
    async (url, options) => {
      sent = { url, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ added: 1, skipped: 0 }) };
    });
  assert.equal(sent.url, 'https://api.test/roster/upload');
  assert.equal(sent.body.students[0].id, '001');
  assert.deepEqual(result, { added: 1, skipped: 0 });
  await assert.rejects(uploadRosterToServer([], { id: 'student', role: 'student' }, 'pw', 'https://api.test'), /organizer/);
});

test('remote student sign-in and password changes call the server API', async () => {
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls++;
    assert.match(url, /^https:\/\/api\.test\/auth\//);
    return { ok: true, json: async () => url.endsWith('/login')
      ? { account: { id: '001', name: 'A', section: 'S', role: 'student', mustChangePassword: true } }
      : { ok: true } };
  };
  const account = await loginStudentRemotely(' 001 ', 'S', 'https://api.test', fetchImpl);
  assert.equal(account.id, '001');
  await changeStudentPasswordRemotely({ id: '001', role: 'student' }, 'S', 'long secure password', 'https://api.test', fetchImpl);
  assert.equal(calls, 2);
  await assert.rejects(loginStudentRemotely('001', 'S', '', fetchImpl), /EXPO_PUBLIC_API_URL/);
});

test('student attendance refresh posts credentials and returns server records', async () => {
  let sent;
  const records = [{ id: 'r1', studentId: '001', eventId: 'e1' }];
  const result = await downloadStudentAttendance({ id: '001', role: 'student' }, 'private password', 'https://api.test',
    async (url, options) => {
      sent = { url, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ records }) };
    });
  assert.equal(sent.url, 'https://api.test/student/attendance');
  assert.deepEqual(sent.body, { id: '001', password: 'private password' });
  assert.deepEqual(result, records);
  await assert.rejects(downloadStudentAttendance({ id: 'admin', role: 'admin' }, 'pw', 'https://api.test'), /student/);
});
