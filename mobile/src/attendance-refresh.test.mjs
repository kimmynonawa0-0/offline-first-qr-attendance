import test from 'node:test';
import assert from 'node:assert/strict';
import { hasServerSession } from './attendance-refresh.mjs';

const organizer = { id: '23-02330', role: 'admin' };
const session = { id: organizer.id, token: 'server-session' };

test('organizer and student refreshes can use their existing server session without a password prompt', () => {
  assert.equal(hasServerSession(organizer, session), true);
  assert.equal(hasServerSession({ id: 'student', role: 'student' }, { id: 'student', role: 'student', token: 'student-token' }), true);
});

test('server sessions are scoped to the matching signed-in identity and role', () => {
  assert.equal(hasServerSession(organizer, null), false);
  assert.equal(hasServerSession(organizer, { ...session, id: 'other' }), false);
  assert.equal(hasServerSession(organizer, { ...session, role: 'student' }), false);
});
