import test from 'node:test';
import assert from 'node:assert/strict';
import { currentTimeValue, currentTwelveHourTime, formatTwelveHourTime } from './event-time.mjs';

test('event time displays in 12-hour format', () => {
  assert.equal(formatTwelveHourTime('00:05'), '12:05 AM');
  assert.equal(formatTwelveHourTime('12:30'), '12:30 PM');
  assert.equal(formatTwelveHourTime('14:45'), '2:45 PM');
  assert.equal(currentTwelveHourTime(new Date(2026, 9, 29, 0, 5)), '12:05 AM');
});

test('event time defaults to the current 24-hour value', () => {
  assert.equal(currentTimeValue(new Date(2026, 9, 29, 0, 5)), '00:05');
  assert.equal(currentTimeValue(new Date(2026, 9, 29, 14, 45)), '14:45');
});
