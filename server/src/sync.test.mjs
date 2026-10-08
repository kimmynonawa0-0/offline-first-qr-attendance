import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordHash, passwordMatches, validateBatch } from './sync.mjs';
import { provisionRoster, validateRoster } from './roster.mjs';

test('organizer password verifier accepts the correct password only', () => {
  const salt = 'test-salt';
  const hash = passwordHash('a-long-private-password', salt);
  assert.equal(passwordMatches('a-long-private-password', salt, hash), true);
  assert.equal(passwordMatches('wrong-password', salt, hash), false);
});

test('sync rejects malformed attendance batches before database writes', () => {
  const batch = { students: [], events: [], records: [] };
  assert.doesNotThrow(() => validateBatch(batch));
  assert.throws(() => validateBatch({ ...batch, records: [{ id: 'r' }] }), /Invalid attendance/);
  assert.throws(() => validateBatch({ ...batch, students: {} }), /Missing students/);
});

test('roster validation rejects duplicate IDs and malformed rows', () => {
  assert.deepEqual(validateRoster([{ id: '001', name: 'A', section: 'S' }]), [{ id: '001', name: 'A', section: 'S', email: '' }]);
  assert.throws(() => validateRoster([{ id: '1', name: 'A', section: 'S' }, { id: '1', name: 'B', section: 'S' }]), /Duplicate student ID/);
  assert.throws(() => validateRoster([{ id: '1', name: '', section: 'S' }]), /Invalid student profile/);
});

test('roster provisions salted section passwords and never resets existing accounts', async () => {
  const students = new Map();
  const client = { async query(sql, args = []) {
    if (sql.startsWith('SELECT password_hash')) return { rows: students.has(args[0]) ? [{ password_hash: students.get(args[0]).password_hash }] : [] };
    if (sql.startsWith('INSERT INTO students')) {
      students.set(args[0], { id: args[0], name: args[1], section: args[2], email: args[3], password_salt: args[4], password_hash: args[5], must_change_password: true });
    }
    if (sql.startsWith('UPDATE students')) {
      const student = students.get(args[0]);
      if (student && !student.password_hash) Object.assign(student, { password_salt: args[1], password_hash: args[2], must_change_password: true });
    }
    return { rows: [] };
  } };
  const first = await provisionRoster(client, [{ id: '001', name: 'A', section: 'BSCS-3C' }]);
  const student = students.get('001');
  assert.deepEqual(first, { added: 1, skipped: 0 });
  assert.notEqual(student.password_salt, 'BSCS-3C');
  assert.equal(passwordMatches('BSCS-3C', student.password_salt, student.password_hash), true);
  student.password_hash = passwordHash('new password', 'existing-salt');
  student.name = 'Edited locally';
  const second = await provisionRoster(client, [{ id: '001', name: 'A changed', section: 'NEW' }]);
  assert.deepEqual(second, { added: 0, skipped: 1 });
  assert.equal(passwordMatches('new password', 'existing-salt', student.password_hash), true);
  assert.equal(student.name, 'Edited locally');
});
