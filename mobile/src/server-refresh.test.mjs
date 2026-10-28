import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serverRefreshScope } from './server-refresh.mjs';

test('student home and records refresh student attendance', () => {
  assert.equal(serverRefreshScope('student-home', 'student'), 'student-attendance');
  assert.equal(serverRefreshScope('records', 'student'), 'student-attendance');
});

test('organizer data screens refresh the assigned bootstrap', () => {
  for (const screen of ['admin-home', 'admin-records', 'history', 'event', 'scanner']) {
    assert.equal(serverRefreshScope(screen, 'admin'), 'organizer-bootstrap');
  }
});

test('screens without server-backed data do not refresh', () => {
  for (const [screen, role] of [
    ['profile', 'student'], ['profile', 'admin'], ['receipt', 'admin'],
    ['roster-import', 'admin'], ['student-home', 'admin'], ['history', 'student'],
  ]) {
    assert.equal(serverRefreshScope(screen, role), null);
  }
});
