import test from 'node:test';
import assert from 'node:assert/strict';
import { validateManagedStudent } from './management-students.mjs';

test('manager student form trims and normalizes profile fields', () => {
  assert.deepEqual(validateManagedStudent({
    id: ' 23-00001 ', name: ' Miko Doinog ', section: ' BSCS-3C ', email: ' MIKO@EXAMPLE.COM ',
  }), { id: '23-00001', name: 'Miko Doinog', section: 'BSCS-3C', email: 'miko@example.com' });
});

test('manager student form allows an empty optional email', () => {
  assert.equal(validateManagedStudent({ id: '23-00001', name: 'Miko', section: 'BSCS-3C' }).email, '');
});

test('manager student form rejects missing identity, invalid email, and control characters', () => {
  assert.throws(() => validateManagedStudent({ id: '', name: 'Miko', section: 'BSCS-3C' }), /required/);
  assert.throws(() => validateManagedStudent({ id: '23-00001', name: 'Miko', section: 'BSCS-3C', email: 'not-an-email' }), /valid email/);
  assert.throws(() => validateManagedStudent({ id: '23-00001', name: 'Miko\nOther', section: 'BSCS-3C' }), /line breaks/);
});
