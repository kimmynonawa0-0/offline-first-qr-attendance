import test from 'node:test';
import assert from 'node:assert/strict';
import { initialData } from './model.mjs';
import { removeBrowserPasswords } from './web-local-data.mjs';

test('browser password cleanup removes credentials but preserves account and attendance data', () => {
  const data = initialData();
  data.students.push({ id: '00123', name: 'Student', section: 'BSCS-3C', password: 'old-password' });
  data.records.push({ id: 'scan-1', studentId: '00123', eventId: 'event-1', synced: false });

  const cleaned = removeBrowserPasswords(data);

  assert.equal(cleaned.students[0].password, undefined);
  assert.equal(cleaned.admins[0].password, undefined);
  assert.equal(cleaned.students[0].name, 'Student');
  assert.deepEqual(cleaned.records, data.records);
  assert.equal(data.students[0].password, 'old-password');
});

test('browser password cleanup returns unchanged data when there are no credentials', () => {
  const data = { ...initialData(), admins: [{ id: '23-02330', name: 'Organizer' }] };
  assert.equal(removeBrowserPasswords(data), data);
});
