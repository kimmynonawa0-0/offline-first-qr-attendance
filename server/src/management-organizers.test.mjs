import test from 'node:test';
import assert from 'node:assert/strict';
import { validateManagedOrganizer } from './management-organizers.mjs';

test('manager organizer form trims and normalizes profile fields', () => {
  assert.deepEqual(validateManagedOrganizer({
    id: ' 23-00001 ', name: ' Miko Doinog ', section: ' BSCS-3C ', temporaryPassword: 'not-the-section',
  }), { id: '23-00001', name: 'Miko Doinog', section: 'BSCS-3C', temporaryPassword: 'not-the-section' });
});

test('manager organizer form allows a blank temporary password for roster IDs', () => {
  const organizer = validateManagedOrganizer({ id: '23-00001', name: 'Miko', section: 'BSCS-3C' });
  assert.equal(organizer.temporaryPassword, '');
});

test('manager organizer form rejects missing identity, short passwords, and control characters', () => {
  assert.throws(() => validateManagedOrganizer({ id: '', name: 'Miko', section: 'BSCS-3C' }), /required/);
  assert.throws(() => validateManagedOrganizer({ id: '23-00001', name: '', section: 'BSCS-3C' }), /required/);
  assert.throws(() => validateManagedOrganizer({ id: '23-00001', name: 'Miko', section: 'BSCS-3C', temporaryPassword: 'short' }), /12 characters/);
  assert.throws(() => validateManagedOrganizer({ id: '23-00001', name: 'Miko\nOther', section: 'BSCS-3C' }), /line breaks/);
  assert.throws(() => validateManagedOrganizer(null), /provided/);
  assert.throws(() => validateManagedOrganizer({ id: 'x'.repeat(101), name: 'Miko', section: 'BSCS-3C' }), /too long/);
});

test('manager organizer form rejects a temporary password equal to the section', () => {
  assert.throws(() => validateManagedOrganizer({ id: '23-00001', name: 'Miko', section: 'BSCS-3C-2026', temporaryPassword: 'bscs-3c-2026' }), /section name/);
  assert.throws(() => validateManagedOrganizer({ id: '23-00001', name: 'Miko', section: 'BSCS-3C-2026', temporaryPassword: 'BSCS-3C-2026' }), /section name/);
  assert.equal(validateManagedOrganizer({ id: '23-00001', name: 'Miko', section: 'BSCS-3C-2026', temporaryPassword: 'bscs-3c-2026-x' }).temporaryPassword, 'bscs-3c-2026-x');
});
