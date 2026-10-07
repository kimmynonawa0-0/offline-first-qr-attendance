import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheRemoteStudent, initialData, login, changePassword, createEvent, deleteEvent, checkIn } from './model.mjs';
import { importRoster, parseRoster, rosterSummary } from './roster.mjs';
import { parseSpreadsheet } from './spreadsheet.mjs';
import * as XLSX from '@e965/xlsx';
import { createRepository, migrateData, STORAGE_KEY } from './storage.mjs';

const password = 'my private passphrase';
const csv = 'student_id,name,section,email\n00123,Juan Dela Cruz,BSCS-3C,juan@example.com';
const rows = parseRoster(csv);
const event = { name: 'Assembly', location: 'Main hall', date: '2026-09-26', time: '10:00' };
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

test('remote student login caches a sanitized student account without changing organizer role', () => {
  const data = cacheRemoteStudent(ready(), { id: '00123', name: 'Juan Dela Cruz', section: 'BSCS-3C',
    role: 'student', mustChangePassword: true }, 'BSCS-3C');
  assert.equal(login(data, '00123', 'BSCS-3C').role, 'student');
  assert.equal(data.students[0].mustChangePassword, true);
  assert.throws(() => cacheRemoteStudent(data, { id: '23-02330', name: 'Wrong', section: 'S', role: 'student' }, 'S'), /organizer/);
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

test('attendance still validates event dates and prevents duplicate organizer/scanned entries', () => {
  const base = ready();
  assert.throws(() => createEvent(base, admin, { ...event, date: '2026-02-30' }, 'e'), /valid date/);
  assert.throws(() => createEvent(base, admin, { ...event, time: '25:00' }, 'e'), /valid time/);
  let data = importRoster(createEvent(createEvent(base, admin, event, 'first'), admin, event, 'second'), admin, rows);
  data = checkIn(data, admin, 'second', { id: '00123', name: 'Juan Dela Cruz' }, 'scan', 'record');
  assert.equal(data.records[0].studentId, '00123');
  assert.equal(data.events[0].attendees.length, 0);
  assert.throws(() => checkIn(data, admin, 'second', { id: '00123', name: 'Juan Dela Cruz' }, 'scan', 'duplicate'), /already present/);
  data = checkIn(data, admin, 'first', { id: 'ignored', name: 'Ignored' }, 'organizer', 'organizer-record');
  assert.equal(data.records[0].studentId, admin.id);
  assert.throws(() => checkIn(data, { ...admin, role: 'student' }, 'second', admin, 'scan', 'bad'), /Log in/);
  assert.throws(() => checkIn(data, admin, 'second', { id: 'not-rostered', name: 'Unknown' }, 'scan', 'bad'), /not in the imported student roster/);
  const deleted = deleteEvent(data, admin, 'second');
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
