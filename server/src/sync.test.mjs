import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordHash, passwordMatches, validateBatch } from './sync.mjs';

test('organizer password verifier accepts the correct password only', () => {
  const salt = 'test-salt';
  const hash = passwordHash('a-long-private-password', salt);
  assert.equal(passwordMatches('a-long-private-password', salt, hash), true);
  assert.equal(passwordMatches('wrong-password', salt, hash), false);
});

test('sync rejects malformed attendance batches before database writes', () => {
  const batch = { adminId: '23-02330', password: 'password', students: [], events: [], records: [] };
  assert.doesNotThrow(() => validateBatch(batch));
  assert.throws(() => validateBatch({ ...batch, records: [{ id: 'r' }] }), /Invalid attendance/);
  assert.throws(() => validateBatch({ ...batch, students: {} }), /Missing students/);
});
