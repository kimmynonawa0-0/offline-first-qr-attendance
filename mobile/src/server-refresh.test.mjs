import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serverRefreshScope } from './server-refresh.mjs';

test('student home and records refresh student attendance', () => {
  assert.equal(serverRefreshScope('student-home', 'student'), 'student-attendance');
  assert.equal(serverRefreshScope('records', 'student'), 'student-attendance');
});

test('screens without student attendance do not use the student pull refresh', () => {
  for (const [screen, role] of [
    ['profile', 'student'], ['admin-home', 'admin'], ['admin-records', 'admin'],
    ['history', 'admin'], ['event', 'admin'], ['scanner', 'admin'], ['receipt', 'admin'],
    ['roster-import', 'admin'], ['student-home', 'admin'], ['history', 'student'],
  ]) {
    assert.equal(serverRefreshScope(screen, role), null);
  }
});
