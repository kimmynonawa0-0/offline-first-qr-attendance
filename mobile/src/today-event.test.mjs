import test from 'node:test';
import assert from 'node:assert/strict';
import { eventForToday, eventsForToday, sortEventsByDate } from './today-event.mjs';
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

test('returns every event scheduled today in start-time order', () => {
  const now = new Date(2026, 9, 24, 12, 0);
  const today = localDate(now);
  const events = [
    { id: 'afternoon', date: today, time: '15:00' },
    { id: 'morning', date: today, time: '08:00' },
    { id: 'tomorrow', date: '2026-10-25', time: '09:00' },
    { id: 'yesterday', date: '2026-10-23', time: '09:00' },
  ];

  assert.deepEqual(eventsForToday(events, now).map(event => event.id), ['morning', 'afternoon']);
  assert.deepEqual(eventsForToday([{ id: 'past', date: '2026-10-23', time: '09:00' }], now), []);
});

test('events are sorted by date and start time', () => {
  const events = [
    { id: 'spring', date: '2026-10-25', time: '08:00' },
    { id: 'late', date: '2026-10-24', time: '13:00' },
    { id: 'early', date: '2026-10-24', time: '09:00' },
    { id: 'older', date: '2026-10-23', time: '18:00' },
  ];

  assert.deepEqual(sortEventsByDate(events).map(event => event.id), ['spring', 'late', 'early', 'older']);
  assert.deepEqual(sortEventsByDate(events, 'asc').map(event => event.id), ['older', 'early', 'late', 'spring']);
  assert.deepEqual(events.map(event => event.id), ['spring', 'late', 'early', 'older']);
});
