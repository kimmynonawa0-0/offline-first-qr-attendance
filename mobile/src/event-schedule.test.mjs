import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultEventEnd, eventEnd, eventSchedule, eventStart, formatEventWindow, normalizeEventDate, normalizeEventTime,
} from './event-schedule.mjs';

test('normalizes event dates and times from stored values', () => {
  assert.equal(normalizeEventDate('2026-11-17'), '2026-11-17');
  assert.equal(normalizeEventDate('2026-11-17T23:59:00.000Z'), '2026-11-17');
  assert.equal(normalizeEventDate('2026-02-30'), '');
  assert.equal(normalizeEventTime('09:05'), '09:05');
  assert.equal(normalizeEventTime('09:05:33'), '09:05');
  assert.equal(normalizeEventTime('25:00'), '');
});

test('uses an explicit end time and defaults old events to one hour', () => {
  assert.equal(eventStart({ time: '13:00' }), '13:00');
  assert.equal(eventStart({ start: '13:00' }), '13:00');
  assert.equal(eventEnd({ time: '13:00', end: '17:00' }), '17:00');
  assert.equal(eventEnd({ time: '13:00' }), '14:00');
  assert.equal(eventEnd({ time: '23:30' }), '23:59');
  assert.equal(defaultEventEnd('13:00'), '14:00');
  assert.equal(formatEventWindow({ time: '13:00', end: '17:00' }), '1:00 PM - 5:00 PM');
});

test('auto-detects Time In and Time Out from the event window', () => {
  const event = { date: '2026-11-17', time: '13:00', end: '17:00' };

  assert.equal(eventSchedule(event, new Date(2026, 10, 17, 12, 59)).phase, 'upcoming');
  assert.equal(eventSchedule(event, new Date(2026, 10, 17, 13, 0)).phase, 'time-in');
  assert.equal(eventSchedule(event, new Date(2026, 10, 17, 16, 59)).phase, 'time-in');
  assert.equal(eventSchedule(event, new Date(2026, 10, 17, 17, 0)).phase, 'time-in');
  assert.equal(eventSchedule(event, new Date(2026, 10, 17, 17, 1)).phase, 'time-out');
  assert.equal(eventSchedule(event, new Date(2026, 10, 18, 9, 0)).phase, 'ended');
  assert.equal(eventSchedule(event, new Date(2026, 10, 16, 9, 0)).phase, 'upcoming');
});

test('schedule actions are exposed for scanning', () => {
  const event = { date: '2026-11-17', time: '13:00', end: '17:00' };
  assert.equal(eventSchedule(event, new Date(2026, 10, 17, 14, 0)).action, 'time-in');
  assert.equal(eventSchedule(event, new Date(2026, 10, 17, 18, 0)).action, 'time-out');
  assert.equal(eventSchedule(event, new Date(2026, 10, 17, 12, 0)).action, null);
});
