import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultEventEnd, eventEnd, eventStart, normalizeEvent, normalizeEventTime } from './event-schedule.mjs';

test('normalizes server event times and defaults old events to one hour', () => {
  assert.equal(normalizeEventTime('13:00:00'), '13:00');
  assert.equal(normalizeEventTime('25:00'), '');
  assert.equal(eventStart({ time: '13:00' }), '13:00');
  assert.equal(eventEnd({ time: '13:00', end: '17:00' }), '17:00');
  assert.equal(eventEnd({ time: '13:00' }), '14:00');
  assert.equal(defaultEventEnd('23:30'), '23:59');
  assert.deepEqual(normalizeEvent({ id: ' e ', name: ' A ', location: ' H ', date: '2026-11-17', time: '13:00', end: '17:00' }), {
    id: 'e', name: 'A', location: 'H', date: '2026-11-17', time: '13:00', end: '17:00',
  });
});
