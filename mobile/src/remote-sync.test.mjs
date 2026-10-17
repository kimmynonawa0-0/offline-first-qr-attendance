import test from 'node:test';
import assert from 'node:assert/strict';
import { changeAdminPasswordRemotely, changeStudentPasswordRemotely, downloadOrganizerAttendance, downloadOrganizerBootstrap, downloadStudentAttendance, isRetryableAuthFailure, loginStudentRemotely, logoutAdminRemotely, markSynced, syncOrganizerWithReauth, syncToServer, uploadRosterToServer } from './remote-sync.mjs';

test('remote sync sends only pending receipts and confirms only accepted IDs', async () => {
  const data = { students: [{ id: '1', name: 'A', section: 'S', password: 'private' }],
    events: [{ id: 'e', name: 'Event', location: 'Hall', date: '2026-10-16', time: '10:00', attendees: [{ id: '1' }] },
      { id: 'old', name: 'Old event', location: 'Room', date: '2026-10-15', time: '09:00', attendees: [] }],
    records: [{ id: 'r1', studentId: '1', eventId: 'e', synced: false }, { id: 'r2', studentId: '1', eventId: 'old', synced: true }] };
  let sent;
  const fetchImpl = async (_, options) => {
    sent = JSON.parse(options.body);
    assert.equal(options.headers.Authorization, 'Bearer opaque-session-token');
    return { ok: true, json: async () => ({ acceptedRecordIds: ['r1'], conflictRecordIds: [] }) };
  };
  const result = await syncToServer(data, { id: '23-02330', role: 'admin' }, 'opaque-session-token', 'http://localhost:3000/', fetchImpl);
  assert.deepEqual(sent.records.map(r => r.id), ['r1']);
  assert.deepEqual(sent.students.map(student => student.id), ['1']);
  assert.deepEqual(sent.events.map(event => event.id), ['e']);
  assert.equal(sent.students[0].password, undefined);
  assert.equal(sent.password, undefined);
  assert.equal(sent.adminId, undefined);
  assert.equal(sent.events[0].attendees, undefined);
  assert.deepEqual(markSynced(data, result.acceptedRecordIds).records.map(r => r.synced), [true, true]);
  assert.equal(data.records[0].synced, false);
});

test('organizer bootstrap sends its session and returns the assigned offline data', async () => {
  const bootstrap = { students: [{ id: '1', name: 'A', section: 'S' }], events: [{ id: 'e' }] };
  const result = await downloadOrganizerBootstrap('session-token', 'https://api.test/', async (url, options) => {
    assert.equal(url, 'https://api.test/organizer/bootstrap');
    assert.equal(options.headers.Authorization, 'Bearer session-token');
    return { ok: true, json: async () => bootstrap };
  });
  assert.deepEqual(result, bootstrap);
});

test('failed server response leaves local data untouched', async () => {
  const data = { students: [], events: [], records: [{ id: 'r1', synced: false }] };
  await assert.rejects(syncToServer(data, { id: 'a', role: 'admin' }, 'opaque-session-token', 'http://localhost:3000',
    async () => ({ ok: false, json: async () => ({ error: 'Wrong password.' }) })), /Wrong password/);
  assert.equal(data.records[0].synced, false);
});

test('roster upload requires organizer role and confirms counts from the remote API', async () => {
  let sent;
  const result = await uploadRosterToServer([{ id: '001', name: 'A', section: 'S' }], { id: 'admin', role: 'admin' }, 'opaque-session-token', 'https://api.test',
    async (url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer opaque-session-token');
      sent = { url, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ added: 1, skipped: 0 }) };
    });
  assert.equal(sent.url, 'https://api.test/roster/upload');
  assert.equal(sent.body.students[0].id, '001');
  assert.deepEqual(result, { added: 1, skipped: 0 });
  await assert.rejects(uploadRosterToServer([], { id: 'student', role: 'student' }, 'opaque-session-token', 'https://api.test'), /organizer/);
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

test('only network failures, timeouts, and server errors are eligible for offline login fallback', async () => {
  await assert.rejects(loginStudentRemotely('1', 'pw', 'https://api.test', async () => { throw new Error('offline'); }), error => isRetryableAuthFailure(error));
  await assert.rejects(loginStudentRemotely('1', 'pw', 'https://api.test', async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); }), error => isRetryableAuthFailure(error));
  for (const status of [500, 503]) {
    await assert.rejects(loginStudentRemotely('1', 'pw', 'https://api.test', async () => ({
      ok: false, status, json: async () => ({ error: 'Temporary server failure.' }),
    })), error => isRetryableAuthFailure(error) && error.status === status);
  }
  for (const status of [401, 403, 404]) {
    await assert.rejects(loginStudentRemotely('1', 'pw', 'https://api.test', async () => ({
      ok: false, status, json: async () => ({ error: 'Access denied.' }),
    })), error => !isRetryableAuthFailure(error) && error.status === status);
  }
});

test('offline organizer login silently obtains a token before syncing pending records', async () => {
  const data = { students: [{ id: '1', name: 'A', section: 'S' }], events: [{ id: 'e', name: 'Event' }],
    records: [{ id: 'pending', studentId: '1', eventId: 'e', synced: false }] };
  const calls = [];
  const result = await syncOrganizerWithReauth(data, { id: 'org', role: 'admin' }, null, 'protected-password', 'https://api.test', async (url, options) => {
    calls.push(url);
    if (url.endsWith('/auth/login')) return { ok: true, json: async () => ({ account: { id: 'org', role: 'admin' }, sessionToken: 'fresh-token' }) };
    assert.equal(options.headers.Authorization, 'Bearer fresh-token');
    assert.deepEqual(JSON.parse(options.body).records.map(record => record.id), ['pending']);
    return { ok: true, json: async () => ({ acceptedRecordIds: ['pending'], conflictRecordIds: [] }) };
  });
  assert.deepEqual(calls, ['https://api.test/auth/login', 'https://api.test/sync']);
  assert.equal(result.sessionToken, 'fresh-token');
  assert.equal(data.records[0].synced, false);
});

test('expired organizer tokens are renewed once, and failed reauthentication leaves records pending', async () => {
  const data = { students: [], events: [], records: [{ id: 'pending', studentId: '1', eventId: 'e', synced: false }] };
  let syncCalls = 0;
  const result = await syncOrganizerWithReauth(data, { id: 'org', role: 'admin' }, 'expired-token', 'protected-password', 'https://api.test', async (url, options) => {
    if (url.endsWith('/auth/login')) return { ok: true, json: async () => ({ account: { id: 'org', role: 'admin' }, sessionToken: 'replacement-token' }) };
    syncCalls++;
    if (syncCalls === 1) return { ok: false, status: 401, json: async () => ({ error: 'Session expired.' }) };
    assert.equal(options.headers.Authorization, 'Bearer replacement-token');
    return { ok: true, json: async () => ({ acceptedRecordIds: ['pending'], conflictRecordIds: [] }) };
  });
  assert.equal(result.sessionToken, 'replacement-token');
  assert.equal(syncCalls, 2);

  await assert.rejects(syncOrganizerWithReauth(data, { id: 'org', role: 'admin' }, 'expired-token', 'old-password', 'https://api.test', async url => {
    if (url.endsWith('/auth/login')) return { ok: false, status: 401, json: async () => ({ error: 'Invalid credentials.' }) };
    return { ok: false, status: 401, json: async () => ({ error: 'Session expired.' }) };
  }), /Pending attendance is still saved locally/);
  assert.equal(data.records[0].synced, false);
});

test('remote organizer sign-in returns a token and password/logout calls use it silently', async () => {
  let count = 0;
  let sentLogin;
  const fetchImpl = async (url, options) => {
    count++;
    if (url.endsWith('/auth/login')) {
      sentLogin = JSON.parse(options.body);
      return { ok: true, json: async () => ({ account: { id: '23-02330', role: 'admin' }, sessionToken: 'opaque-session-token' }) };
    }
    assert.equal(options.headers.Authorization, 'Bearer opaque-session-token');
    return { ok: true, json: async () => url.endsWith('/auth/admin/password')
      ? { ok: true, sessionToken: 'replacement-session-token' }
      : { ok: true } };
  };
  const account = await loginStudentRemotely('23-02330', 'current password', 'https://api.test', fetchImpl);
  assert.equal(account.sessionToken, 'opaque-session-token');
  assert.deepEqual(sentLogin, { id: '23-02330', password: 'current password', client: 'mobile' });
  const updated = await changeAdminPasswordRemotely(account, account.sessionToken, 'current password', 'a much longer password', 'https://api.test', fetchImpl);
  assert.equal(updated.sessionToken, 'replacement-session-token');
  await logoutAdminRemotely(account.sessionToken, 'https://api.test', fetchImpl);
  assert.equal(count, 3);
});

test('online organizer login can rotate the saved token without exposing it in the form', async () => {
  let authHeader;
  await loginStudentRemotely('23-02330', 'password', 'https://api.test', async (_, options) => {
    authHeader = options.headers.Authorization;
    return { ok: true, json: async () => ({ account: { id: '23-02330', role: 'admin' }, sessionToken: 'new-session-token' }) };
  }, 'old-session-token');
  assert.equal(authHeader, 'Bearer old-session-token');
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

test('organizer attendance refresh uses its session and maps server rows for the app', async () => {
  let sentUrl;
  const records = await downloadOrganizerAttendance({ id: '23-02330', role: 'admin' }, 'organizer-token', 'https://api.test/',
    async (url, options) => {
      sentUrl = url;
      assert.equal(options.headers.Authorization, 'Bearer organizer-token');
      return { ok: true, json: async () => ({ records: [{ id: 'r1', student_id: '001', student_name: 'A Student', event_id: 'e1', event_name: 'Assembly', location: 'Hall', recorded_at: '2026-10-17T02:30:00.000Z', method: 'scan' }] }) };
    });
  assert.equal(sentUrl, 'https://api.test/organizer/attendance');
  assert.deepEqual(records[0], {
    id: 'r1', studentId: '001', studentName: 'A Student', eventId: 'e1', event: 'Assembly', location: 'Hall',
    recordedAt: '2026-10-17T02:30:00.000Z', date: '2026-10-17',
    time: new Date('2026-10-17T02:30:00.000Z').toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
    status: 'PRESENT', method: 'scan',
  });
  await assert.rejects(downloadOrganizerAttendance({ id: '23-02330', role: 'admin' }, null, 'https://api.test'), /Sign in online/);
});
