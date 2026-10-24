import test from 'node:test';
import assert from 'node:assert/strict';
import { eventForToday } from './today-event.mjs';
import { localDate } from './model.mjs';

test('selects the latest event that has started today', () => {
  const now = new Date(2026, 9, 24, 10, 30);
  const today = localDate(now);
  const events = [
    { id: 'later', date: today, time: '13:00' },
    { id: 'early', date: today, time: '08:00' },
    { id: 'current', date: today, time: '10:00' },
    { id: 'yesterday', date: '2026-10-23', time: '23:00' },
  ];

  assert.equal(eventForToday(events, now)?.id, 'current');
});

test('selects the next event today if none have started and no event if today is empty', () => {
  const now = new Date(2026, 9, 24, 8, 0);
  const today = localDate(now);

  assert.equal(eventForToday([
    { id: 'later', date: today, time: '13:00' },
    { id: 'first', date: today, time: '09:00' },
  ], now)?.id, 'first');
  assert.equal(eventForToday([{ id: 'past', date: '2026-10-23', time: '09:00' }], now), null);
});
