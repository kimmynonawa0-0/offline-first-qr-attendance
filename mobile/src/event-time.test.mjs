import test from 'node:test';
import assert from 'node:assert/strict';
import { currentTwelveHourTime, formatTwelveHourTime, parseTwelveHourTime } from './event-time.mjs';

test('event form accepts AM/PM and converts it to server time', () => {
  assert.equal(parseTwelveHourTime('9:05 AM'), '09:05');
  assert.equal(parseTwelveHourTime('12:30 AM'), '00:30');
  assert.equal(parseTwelveHourTime('12:30 PM'), '12:30');
  assert.equal(parseTwelveHourTime('2:45 pm'), '14:45');
  assert.throws(() => parseTwelveHourTime('14:45'), /9:30 AM/);
  assert.throws(() => parseTwelveHourTime('0:30 PM'), /9:30 AM/);
});

test('event time displays in 12-hour format', () => {
  assert.equal(formatTwelveHourTime('00:05'), '12:05 AM');
  assert.equal(formatTwelveHourTime('12:30'), '12:30 PM');
  assert.equal(formatTwelveHourTime('14:45'), '2:45 PM');
  assert.equal(currentTwelveHourTime(new Date(2026, 9, 29, 0, 5)), '12:05 AM');
});
