import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attendanceStatus, cacheRemoteAdminPassword, cacheRemoteStudent, initialData, login, changePassword, createEvent, deleteEvent, checkIn, eventAttendanceRows, mergeOrganizerAttendance, mergeOrganizerBootstrap, mergeStudentAttendance, mergeStudentEvents } from './model.mjs';
import { importRoster, parseRoster, rosterSummary } from './roster.mjs';
import { parseSpreadsheet } from './spreadsheet.mjs';
import * as XLSX from '@e965/xlsx';
import { createRepository, migrateData, STORAGE_KEY } from './storage.mjs';

const password = 'my private passphrase';
const csv = 'student_id,name,section,email\n00123,Juan Dela Cruz,BSCS-3C,juan@example.com';
const rows = parseRoster(csv);
const event = { name: 'Assembly', location: 'Main hall', date: '2026-09-26', time: '10:00', end: '12:00' };
function ready() {
  const data = initialData();
  return changePassword(data, login(data, '23-02330', 'BSCS-3C'), password, password);
}
const admin = login(ready(), '23-02330', password);

test('one login detects the stored role by ID, never email or caller-selected role', () => {
  const data = importRoster(ready(), admin, rows);
  assert.equal(login(data, ' 23-02330 ', password).role, 'admin');
  assert.equal(login(data, '00123', 'BSCS-3C').role, 'student');
  assert.equal(login(data, '00123', 'BSCS-3C').mustChangePassword, true);
  assert.equal('password' in login(data, '00123', 'BSCS-3C'), false);
  for (const id of ['juan@example.com', 'unknown']) assert.throws(() => login(data, id, 'BSCS-3C'), /Invalid/);
  assert.throws(() => login(data, '00123', 'wrong'), /Invalid/);
});

test('remote student login demotes a revoked organizer and preserves attendance', () => {
  let data = importRoster(ready(), admin, rows);
  data.admins.push({ id: '00123', name: 'Juan Dela Cruz', section: 'BSCS-3C', email: '', password: 'old admin password', mustChangePassword: false });
  data.students = data.students.filter(student => student.id !== '00123');
  data.records = [{ id: 'history', studentId: '00123', eventId: 'e1', studentName: 'Juan Dela Cruz', recordedAt: '2026-10-17T01:00:00.000Z', synced: true }];

  data = cacheRemoteStudent(data, { id: '00123', name: 'Juan Dela Cruz', section: 'BSCS-3C', email: '', role: 'student', mustChangePassword: false }, 'student password');

  assert.equal(data.admins.some(account => account.id === '00123'), false);
  assert.equal(login(data, '00123', 'student password').role, 'student');
  assert.equal(data.records[0].id, 'history');

  data = cacheRemoteAdminPassword(data, '00123', 'student password', { name: 'Juan Dela Cruz', section: 'BSCS-3C', mustChangePassword: false });
  assert.equal(data.students.some(account => account.id === '00123'), false);
  assert.equal(login(data, '00123', 'student password').role, 'admin');
  assert.equal(data.records[0].id, 'history');
});

test('organizer bootstrap refreshes assigned data without replacing local passwords or attendance', () => {
  let data = importRoster(ready(), admin, rows);
  data.students[0].password = 'student private password';
  data.events = [{ id: 'old', name: 'Old', attendees: [], assignedToOrganizer: true },
    { id: 'local', name: 'Quick event', attendees: [], createdLocally: true, assignedToOrganizer: true }];
  data.records = [{ id: 'pending', studentId: '00123', eventId: 'old', synced: false }];
  data = mergeOrganizerBootstrap(data, {
    students: [{ id: '00123', name: 'Juan Updated', section: 'BSCS-3C' }],
    events: [{ id: 'assigned', name: 'Assembly', location: 'Hall', date: '2026-10-16', time: '10:00', attendees: [] }],
  });
  assert.equal(data.students[0].password, 'student private password');
  assert.equal(data.events.find(item => item.id === 'old').assignedToOrganizer, false);
  assert.equal(data.events.find(item => item.id === 'local').assignedToOrganizer, true);
  assert.equal(data.events.find(item => item.id === 'assigned').assignedToOrganizer, true);
  assert.equal(data.records[0].synced, false);
  data = cacheRemoteAdminPassword(data, '00123', 'student private password', { name: 'Juan Updated', mustChangePassword: false });
  assert.equal(login(data, '00123', 'student private password').role, 'admin');
  assert.equal(data.students.some(item => item.id === '00123'), false);
  assert.equal(data.records[0].id, 'pending');
});

test('organizer bootstrap includes server attendance so Time Out can be scanned on this device', () => {
  let data = { ...ready(), events: [], records: [] };
  data = mergeOrganizerBootstrap(data, {
    students: [{ id: '00123', name: 'Juan Dela Cruz', section: 'BSCS-3C' }],
    events: [{ id: 'e1', name: 'Assembly', location: 'Hall', date: '2026-10-17', time: '09:00', attendees: [] }],
    attendance: [{ id: 'r1', studentId: '00123', studentName: 'Juan Dela Cruz', eventId: 'e1', event: 'Assembly',
      location: 'Hall', recordedAt: '2026-10-17T01:00:00.000Z', timeInAt: '2026-10-17T01:00:00.000Z',
      timeIn: '09:00 AM', timeInMethod: 'scan', timeOutAt: null, timeOut: '', timeOutMethod: null }],
  });
  assert.equal(attendanceStatus(data, 'e1', '00123').status, 'timed-in');
  assert.equal(data.records[0].synced, true);
});

test('organizer bootstrap loads students from every section for cross-section scanning', () => {
  const data = mergeOrganizerBootstrap({ ...ready(), events: [], records: [] }, {
    students: [
      { id: '00123', name: 'Juan Dela Cruz', section: 'BSCS-3C' },
      { id: '90001', name: 'Other Section Student', section: 'BSIT-2A' },
    ],
    events: [],
  });
  assert.equal(data.students.some(student => student.id === '90001' && student.section === 'BSIT-2A'), true);
});

test('organizer bootstrap skips malformed roster entries instead of blocking sign-in', () => {
  const data = mergeOrganizerBootstrap({ ...ready(), events: [], records: [] }, {
    students: [
      { id: '', name: 'Blank ID', section: 'BSCS-3C' },
      { id: '90001', name: 'Valid Student', section: 'BSIT-2A' },
      { id: '90002', name: 'Blank Section', section: '' },
      { name: 'Missing ID', section: 'BSCS-3C' },
    ],
    events: [],
  });
  assert.deepEqual(data.students.map(student => student.id), ['90001']);
  assert.equal(data.students[0].name, 'Valid Student');
});

test('duplicate scans from two organizers merge into one event/student record after sync', () => {
  const data = {
    ...ready(),
    events: [{ id: 'e1', name: 'Assembly', attendees: [], assignedToOrganizer: true }],
    records: [{
      id: 'local-device', studentId: '00123', studentName: 'Juan Dela Cruz', eventId: 'e1', event: 'Assembly',
      recordedAt: '2026-10-17T01:05:00.000Z', timeInAt: '2026-10-17T01:05:00.000Z', timeIn: '09:05 AM',
      timeInMethod: 'scan', timeOutAt: null, timeOut: '', timeOutMethod: null, synced: false,
    }],
  };
  const next = mergeOrganizerAttendance(data, [{
    id: 'server-record', studentId: '00123', studentName: 'Juan Dela Cruz', eventId: 'e1', event: 'Assembly',
    recordedAt: '2026-10-17T01:00:00.000Z', timeInAt: '2026-10-17T01:00:00.000Z', timeIn: '09:00 AM',
    timeInMethod: 'organizer', timeOutAt: '2026-10-17T09:00:00.000Z', timeOut: '05:00 PM', timeOutMethod: 'scan',
  }]);
  assert.equal(next.records.length, 1);
  assert.equal(next.records[0].id, 'local-device');
  assert.equal(next.records[0].timeOutAt, '2026-10-17T09:00:00.000Z');
  assert.equal(next.records[0].synced, false);
  assert.equal(next.events[0].attendees.length, 1);
});

test('student attendance refresh merges only that student\'s records and preserves local history', () => {
  const data = cacheRemoteStudent(ready(), { id: '00123', name: 'Juan Dela Cruz', section: 'BSCS-3C', role: 'student' }, 'BSCS-3C');
  data.records = [{ id: 'local', studentId: '00123', eventId: 'e0', recordedAt: '2026-09-25T10:00:00.000Z', synced: false }];
  const next = mergeStudentAttendance(data, '00123', [
    { id: 'remote', studentId: '00123', eventId: 'e1', recordedAt: '2026-09-26T10:00:00.000Z' },
  ]);
  assert.deepEqual(next.records.map(record => record.id), ['remote', 'local']);
  assert.equal(next.records[0].synced, true);
  assert.equal(next.records[1].synced, false);
  assert.throws(() => mergeStudentAttendance(data, '00123', [
    { id: 'other', studentId: 'another-student', eventId: 'e1', recordedAt: '2026-09-26T10:00:00.000Z' },
  ]), /invalid attendance record/i);
});

test('student events merge shows events from every section without touching local event data', () => {
  let data = { ...ready(), events: [{ id: 'local', name: 'Quick event', attendees: [{ id: '00123' }],
    createdLocally: true, assignedToOrganizer: true }] };
  data = mergeStudentEvents(data, [
    { id: 'e1', name: 'Assembly', location: 'Hall', date: '2026-10-17', time: '09:00', end: '12:00' },
    { id: 'e2', name: 'Cross-section fair', location: 'Gym', date: '2026-10-18', time: '08:00', end: '17:00' },
  ]);
  assert.equal(data.events.length, 3);
  assert.deepEqual(data.events.find(event => event.id === 'e1'), {
    id: 'e1', name: 'Assembly', location: 'Hall', date: '2026-10-17', time: '09:00', end: '12:00', attendees: [],
  });
  const local = data.events.find(event => event.id === 'local');
  assert.equal(local.createdLocally, true);
  assert.equal(local.assignedToOrganizer, true);
  assert.deepEqual(local.attendees, [{ id: '00123' }]);
  assert.throws(() => mergeStudentEvents(data, null), /invalid event list/i);
});

test('student events merge refreshes existing events and skips malformed rows', () => {
  const data = mergeStudentEvents({ ...ready(), events: [{ id: 'e1', name: 'Old name', location: 'Hall',
    date: '2026-10-17', time: '09:00', end: '12:00', attendees: [{ id: '00123' }] }] }, [
    { id: 'e1', name: 'Updated name', location: 'New hall', date: '2026-10-17', time: '10:00', end: '13:00' },
    { id: '', name: 'Blank ID', location: 'X', date: '2026-10-17', time: '09:00', end: '12:00' },
    { id: 'e2', name: 'Missing date', location: 'X', date: 'bad', time: '09:00', end: '12:00' },
  ]);
  assert.equal(data.events.length, 1);
  const event = data.events[0];
  assert.equal(event.name, 'Updated name');
  assert.equal(event.location, 'New hall');
  assert.equal(event.time, '10:00');
  assert.deepEqual(event.attendees, [{ id: '00123' }]);
});

test('organizer attendance refresh merges server records and preserves pending scans', () => {
  const data = { ...ready(), events: [{ id: 'e1', name: 'Assembly', attendees: [] }], records: [
    { id: 'pending', studentId: '00123', eventId: 'e1', recordedAt: '2026-10-17T02:00:00.000Z', synced: false },
  ] };
  const next = mergeOrganizerAttendance(data, [{ id: 'server', studentId: '00456', studentName: 'Miko Test', eventId: 'e1', event: 'Assembly', recordedAt: '2026-10-17T03:00:00.000Z', date: '2026-10-17', time: '11:00', method: 'scan' }]);
  assert.deepEqual(next.records.map(record => record.id), ['server', 'pending']);
  assert.equal(next.records[0].synced, true);
  assert.equal(next.records[1].synced, false);
  assert.deepEqual(next.events[0].attendees, [{ id: '00456', name: 'Miko Test', time: '11:00', method: 'scan',
    timeInAt: '2026-10-17T03:00:00.000Z', timeOutAt: null, timeOut: '', timeOutMethod: null }]);
  assert.throws(() => mergeOrganizerAttendance(data, [{ id: 'broken' }]), /invalid attendance record/i);
});

test('event attendance rows group students by event and keep their scan state', () => {
  const data = { ...ready(), events: [
    { id: 'e1', name: 'Assembly', attendees: [{ id: '00123', name: 'Juan Dela Cruz', time: '09:00',
      timeInAt: '2026-10-26T01:00:00.000Z', timeOutAt: '2026-10-26T09:00:00.000Z', timeOut: '17:00', timeOutMethod: 'scan' }] },
    { id: 'e2', name: 'Other event', attendees: [] },
  ], records: [
    { id: 'r1', studentId: '00123', studentName: 'Juan Dela Cruz', eventId: 'e1', recordedAt: '2026-10-26T01:00:00.000Z',
      timeInAt: '2026-10-26T01:00:00.000Z', timeIn: '09:00', timeInMethod: 'scan', timeOutAt: '2026-10-26T09:00:00.000Z',
      timeOut: '17:00', timeOutMethod: 'scan', synced: true },
    { id: 'r2', studentId: '00456', studentName: 'Miko Test', eventId: 'e1', recordedAt: '2026-10-26T02:00:00.000Z',
      timeInAt: '2026-10-26T02:00:00.000Z', timeIn: '10:00', timeInMethod: 'organizer', synced: false },
    { id: 'r3', studentId: '00999', studentName: 'Other Student', eventId: 'e2', recordedAt: '2026-10-27T02:00:00.000Z', synced: true },
  ] };
  const rows = eventAttendanceRows(data, 'e1');
  assert.deepEqual(rows.map(row => row.studentId), ['00456', '00123']);
  assert.equal(rows[0].timeIn, '10:00');
  assert.equal(rows[0].synced, false);
  assert.equal(rows[1].timeOut, '17:00');
  assert.equal(rows[1].timeOutMethod, 'scan');
  assert.deepEqual(eventAttendanceRows(data, 'missing'), []);
});

for (const role of ['student', 'admin']) test(`${role} must replace the temporary password without changing identity`, () => {
  const data = role === 'admin' ? initialData() : importRoster(ready(), admin, rows);
  const id = role === 'admin' ? '23-02330' : '00123';
  const user = login(data, id, 'BSCS-3C');
  assert.throws(() => changePassword(data, user, 'short', 'short'), /12 characters/);
  assert.throws(() => changePassword(data, user, password, 'mismatch'), /match/);
  const next = changePassword(data, user, password, password);
  const key = role === 'admin' ? 'admins' : 'students';
  assert.deepEqual(next[key][0], { ...data[key][0], password, mustChangePassword: false });
  assert.throws(() => login(next, id, 'BSCS-3C'), /Invalid/);
  assert.equal(login(next, id, password).mustChangePassword, false);
  assert.throws(() => changePassword(next, user, 'another password', 'another password'), /not pending/);
});

test('long section cannot be reused as a password; pending admins cannot access mutations', () => {
  const data = initialData();
  data.admins[0].section = data.admins[0].password = 'COMPUTER-SCIENCE-3C';
  const user = login(data, '23-02330', 'COMPUTER-SCIENCE-3C');
  assert.throws(() => changePassword(data, user, 'computer-science-3c', 'computer-science-3c'), /not your section/);
  for (const action of [() => importRoster(data, user, rows), () => createEvent(data, user, event, 'e'),
    () => deleteEvent(data, user, 'e'), () => checkIn(data, user, 'e', user, 'organizer', 'r')]) {
    assert.throws(action, /Change your password/);
  }
});

test('CSV supports BOM, CRLF, aliases, optional email, quotes and leading zero IDs', () => {
  const result = parseRoster('\uFEFFStudent ID,Full Name,Section\r\n001,"Santos, ""Maria""",BSCS-3C\r\n\r\n');
  assert.deepEqual(result, [{ id: '001', name: 'Santos, "Maria"', section: 'BSCS-3C', email: '' }]);
});

test('invalid CSVs fail as a whole with actionable errors', () => {
  for (const text of ['', 'id,name\n1,Test', 'id,name,section\n1,Test,',
    'id,name,section\n1,A,S\n1,B,S', 'id,name,section\n1,"Unclosed,S',
    'id,name,section\n1,"Name"oops,S', 'id,name,section\n1,A,S,extra',
    'id,name,section,role\n1,A,S,admin', 'id,name,section,password\n1,A,S,secret',
    'id,student_id,name,section\n1,2,A,S', 'id,name,section,email\n1,A,S,bad']) {
    assert.throws(() => parseRoster(text), Error, text);
  }
  assert.throws(() => parseRoster('x'.repeat(1024 * 1024 + 1)), /1 MB/);
});

test('Excel workbooks use the same roster rules and preserve text IDs', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Student ID', 'Full Name', 'Section', 'Email'],
    ['00123', 'Juan Dela Cruz', 'BSCS-3C', 'juan@example.com'],
  ]), 'Faculty roster');
  for (const bookType of ['xlsx', 'xls']) {
    const bytes = XLSX.write(workbook, { type: 'array', bookType });
    assert.deepEqual(parseSpreadsheet(bytes), rows);
  }
  assert.deepEqual(importRoster(ready(), admin, parseSpreadsheet(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }))).students[0].id, '00123');
});

test('Excel rejects numeric IDs, missing columns, duplicate IDs, and malformed files', () => {
  function workbookBuffer(table) {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(table), 'Sheet1');
    return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  }
  assert.throws(() => parseSpreadsheet(workbookBuffer([['id', 'name', 'section'], [123, 'Juan', 'BSCS-3C']])), /format Student ID cells as text/);
  assert.throws(() => parseSpreadsheet(workbookBuffer([['id', 'name'], ['00123', 'Juan']])), /section column/);
  assert.throws(() => parseSpreadsheet(workbookBuffer([['id', 'name', 'section'], ['00123', 'Juan', 'S'], ['00123', 'Maria', 'S']])), /duplicate student ID/);
  assert.throws(() => parseSpreadsheet(new ArrayBuffer(1024 * 1024 + 1)), /1 MB/);
  assert.throws(() => parseSpreadsheet(new Uint8Array([1, 2, 3]).buffer), /Could not read|header/);
});

test('import is idempotent, student-only, and preserves existing accounts and changed passwords', () => {
  let data = importRoster(ready(), admin, rows);
  data = changePassword(data, login(data, '00123', 'BSCS-3C'), password, password);
  const incoming = [...rows, { id: '23-02330', name: 'Replacement', section: 'OTHER' }];
  assert.deepEqual(rosterSummary(data, incoming), { added: 0, skipped: 2 });
  assert.deepEqual(importRoster(data, admin, incoming), data);
  assert.throws(() => importRoster(data, admin, [...rows, { id: 'broken' }]), /required/);
  assert.throws(() => importRoster(data, admin, [...rows, ...rows]), /duplicate/);
  const forged = importRoster(data, admin, [{ id: 'new', name: 'New', section: 'S', role: 'admin', password: 'injected' }]);
  assert.equal(login(forged, 'new', 'S').role, 'student');
  assert.deepEqual(forged.admins, data.admins);
  for (const user of [null, { ...admin, role: 'student' }, { ...admin, id: 'forged' }]) {
    assert.throws(() => importRoster(data, user, rows), /Log in as an admin/);
  }
});

test('old accounts migrate without losing events or receipts; admin wins duplicate cross-role ID', () => {
  const old = { version: 1, admins: [{ id: '1', name: 'Admin', password: 'old admin' }],
    students: [{ id: '1', name: 'Student', password: 'old student' }, { id: '2', name: 'Other', password: 'old' }], events: [event], records: [{ id: 'receipt' }] };
  const data = migrateData(old);
  assert.equal(data.version, 2);
  assert.equal(data.students.length, 1);
  assert.equal(login(data, '1', 'old admin').mustChangePassword, true);
  assert.equal(login(data, '2', 'old').mustChangePassword, true);
  assert.deepEqual(data.events, old.events);
  assert.deepEqual(data.records, old.records);
  assert.equal(migrateData(data), data);
  assert.equal(migrateData({ ...old, admins: [], students: [] }).admins[0].id, '23-02330');
  assert.throws(() => migrateData({ ...old, version: 99 }), /cannot be opened/);
});

test('attendance supports one Time In and one Time Out per event without duplicate scans', () => {
  const base = ready();
  const scheduledEvent = { ...event, date: '2026-10-26', time: '13:00', end: '17:00' };
  const timeIn = new Date(2026, 9, 26, 14, 0);
  const timeOut = new Date(2026, 9, 26, 18, 0);
  assert.throws(() => createEvent(base, admin, { ...event, date: '2026-02-30' }, 'e'), /valid date/);
  assert.throws(() => createEvent(base, admin, { ...event, time: '25:00' }, 'e'), /valid start time/);
  assert.throws(() => createEvent(base, admin, { ...event, end: '09:00' }, 'e'), /End time/);
  let data = importRoster(createEvent(createEvent(base, admin, scheduledEvent, 'first'), admin, scheduledEvent, 'second'), admin, rows);
  data = checkIn(data, admin, 'second', { id: '00123', name: 'Juan Dela Cruz' }, 'scan', 'record', timeIn);
  assert.equal(data.records[0].studentId, '00123');
  assert.equal(data.events[0].attendees.length, 0);
  assert.throws(() => checkIn(data, admin, 'second', { id: '00123', name: 'Juan Dela Cruz' }, 'scan', 'duplicate', timeIn), /already timed in/);
  data.students.push({ id: '00456', name: 'Miko Test', section: 'BSCS-3C' });
  assert.throws(() => checkIn(data, admin, 'second', { id: '00456', name: 'Miko Test' }, 'scan', 'early-out', timeOut), /no Time In/);
  assert.throws(() => checkIn(data, admin, 'second', { id: '00456', name: 'Miko Test' }, 'scan', 'early-in', new Date(2026, 9, 26, 12, 0)), /not started|opens at/i);
  const timeInAt = data.records[0].timeInAt;
  data = checkIn(data, admin, 'second', { id: '00123', name: 'Juan Dela Cruz' }, 'scan', 'record', timeOut);
  assert.equal(data.records[0].id, 'record');
  assert.equal(data.records[0].timeInAt, timeInAt);
  assert.equal(data.records[0].timeOutAt, timeOut.toISOString());
  assert.equal(data.records[0].synced, false);
  assert.throws(() => checkIn(data, admin, 'second', { id: '00123', name: 'Juan Dela Cruz' }, 'scan', 'duplicate-out', timeOut), /already timed out/);
  assert.throws(() => checkIn(data, admin, 'second', { id: '00123', name: 'Juan Dela Cruz' }, 'scan', 'duplicate-in', timeIn), /already completed/);
  data = checkIn(data, admin, 'first', { id: 'ignored', name: 'Ignored' }, 'organizer', 'organizer-record', timeIn);
  assert.equal(data.records[0].studentId, admin.id);
  assert.throws(() => checkIn(data, { ...admin, role: 'student' }, 'second', admin, 'scan', 'bad'), /Log in/);
  assert.throws(() => checkIn(data, admin, 'second', { id: 'not-rostered', name: 'Unknown' }, 'scan', 'bad', timeIn), /not in the imported student roster/);
  data = createEvent(data, admin, scheduledEvent, 'empty');
  assert.throws(() => deleteEvent(data, admin, 'second'), /attendance records/);
  const deleted = deleteEvent(data, admin, 'empty');
  assert.equal(deleted.events.some(item => item.id === 'empty'), false);
  assert.equal(deleted.records.length, 2);
  assert.ok(deleted.records.every(record => !record.synced));
});

test('saved demo ID is renamed once, preserving passwords and attendance references', async () => {
  const old = ready();
  old.admins[0].id = 'DEMO-ADMIN';
  old.events = [{ ...event, id: 'e', attendees: [{ id: 'DEMO-ADMIN', name: 'Demo Organizer' }] }];
  old.records = [{ id: 'r', studentId: 'DEMO-ADMIN', eventId: 'e', method: 'organizer' }];
  let raw = JSON.stringify(old);
  const storage = { getItem: async () => raw, setItem: async (_, value) => { raw = value; } };
  const data = await createRepository(storage).load();
  assert.equal(login(data, '23-02330', password).mustChangePassword, false);
  assert.throws(() => login(data, 'DEMO-ADMIN', password), /Invalid/);
  assert.equal(data.events[0].attendees[0].id, '23-02330');
  assert.equal(data.records[0].studentId, '23-02330');
  assert.deepEqual(JSON.parse(raw), data);
  assert.equal(migrateData(data), data);
  const conflict = { ...old, students: [{ id: '23-02330', name: 'Existing student' }] };
  raw = JSON.stringify(conflict);
  await assert.rejects(createRepository(storage).load(), /already belongs/);
  assert.deepEqual(JSON.parse(raw), conflict);
  raw = JSON.stringify(old);
  await assert.rejects(createRepository({ ...storage, setItem: async () => { throw new Error('Disk full'); } }).load(), /Disk full/);
  assert.deepEqual(JSON.parse(raw), old);
});

test('repository saves imports and password state across reloads and serializes updates', async () => {
  let raw = null;
  const storage = { getItem: async () => raw, setItem: async (_, value) => { raw = value; } };
  const repo = createRepository(storage);
  await repo.load();
  await repo.update(() => ready());
  await Promise.all([repo.update(d => importRoster(d, admin, rows)), repo.update(d => createEvent(d, admin, event, 'e'))]);
  await repo.update(d => changePassword(d, login(d, '00123', 'BSCS-3C'), password, password));
  const reloaded = await createRepository(storage).load();
  assert.equal(login(reloaded, '00123', password).mustChangePassword, false);
  assert.equal(reloaded.events.length, 1);
  assert.equal(reloaded.students.length, 1);
});

for (const version of [1, 2]) test(`version ${version} with an older admin provisions the missing demo without replacing accounts`, async () => {
  const existing = { id: '22-01001', name: 'Existing Admin', section: 'BSCS-4A', password, mustChangePassword: false };
  const old = { version, admins: [existing], students: [], events: [], records: [] };
  let raw = JSON.stringify(old);
  const storage = { getItem: async () => raw, setItem: async (_, value) => { raw = value; } };
  const data = await createRepository(storage).load();
  assert.equal(login(data, '23-02330', 'BSCS-3C').role, 'admin');
  assert.equal(login(data, '23-02330', 'BSCS-3C').mustChangePassword, true);
  assert.equal(login(data, existing.id, password).name, existing.name);
  assert.deepEqual(data.records, old.records);
  assert.deepEqual(data.events, old.events);
  assert.deepEqual(JSON.parse(raw), data);
  assert.deepEqual(await createRepository(storage).load(), data);
  assert.equal(data.admins.length, 2);
});

test('demo setup never resets a changed password or promotes a student using that ID', () => {
  const changed = ready();
  assert.equal(migrateData(changed), changed);
  assert.throws(() => login(migrateData(changed), '23-02330', 'BSCS-3C'), /Invalid/);
  const occupied = { ...initialData(), admins: [], students: [{ id: '23-02330', name: 'Student', section: 'OTHER', password: 'student password', mustChangePassword: false }] };
  assert.equal(migrateData(occupied), occupied);
  assert.equal(login(migrateData(occupied), '23-02330', 'student password').role, 'student');
});

test('failed save does not unlock account or partially import; corrupt data is not overwritten', async () => {
  let raw = JSON.stringify(initialData()), fail = false;
  const storage = { getItem: async () => raw, setItem: async (_, value) => { if (fail) throw new Error('Disk full'); raw = value; } };
  const repo = createRepository(storage);
  await repo.load(); fail = true;
  await assert.rejects(repo.update(d => changePassword(d, login(d, '23-02330', 'BSCS-3C'), password, password)), /Disk full/);
  assert.equal(JSON.parse(raw).admins[0].mustChangePassword, true);
  fail = false; await repo.update(() => ready()); fail = true;
  await assert.rejects(repo.update(d => importRoster(d, admin, rows)), /Disk full/);
  fail = false;
  assert.equal((await repo.update(d => d)).students.length, 0);
  raw = '{broken';
  await assert.rejects(createRepository(storage).load());
  assert.equal(raw, '{broken');
  assert.equal(STORAGE_KEY, 'norwe-scan-mobile-v1');
});
