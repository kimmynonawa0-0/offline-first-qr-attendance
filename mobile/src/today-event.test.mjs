import test from 'node:test';
import assert from 'node:assert/strict';
import { eventDayLabel, eventForToday, eventsForToday, groupEventsByPhase, isEventPast, sortEventsByDate } from './today-event.mjs';
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

test('events stay current until the day ends', () => {
  const now = new Date(2026, 9, 24, 23, 30);

  assert.equal(isEventPast({ date: '2026-10-24', time: '08:00' }, now), false);
  assert.equal(isEventPast({ date: '2026-10-23', time: '23:59' }, now), true);
  assert.equal(isEventPast({ date: '2026-10-25', time: '08:00' }, now), false);
  assert.equal(isEventPast({}, now), false);
});

test('groups events into today, upcoming, and newest-first past', () => {
  const now = new Date(2026, 9, 24, 12, 0);
  const events = [
    { id: 'past-old', date: '2026-10-20', time: '09:00' },
    { id: 'today-late', date: '2026-10-24', time: '15:00' },
    { id: 'upcoming-far', date: '2026-11-02', time: '08:00' },
    { id: 'today-early', date: '2026-10-24', time: '08:00' },
    { id: 'past-recent', date: '2026-10-23', time: '17:00' },
    { id: 'upcoming-near', date: '2026-10-25', time: '10:00' },
  ];

  const grouped = groupEventsByPhase(events, now);

  assert.deepEqual(grouped.today.map(event => event.id), ['today-early', 'today-late']);
  assert.deepEqual(grouped.upcoming.map(event => event.id), ['upcoming-near', 'upcoming-far']);
  assert.deepEqual(grouped.past.map(event => event.id), ['past-recent', 'past-old']);
  assert.deepEqual(events.map(event => event.id), ['past-old', 'today-late', 'upcoming-far', 'today-early', 'past-recent', 'upcoming-near']);
});

test('labels event dates relative to today', () => {
  const now = new Date(2026, 9, 24, 12, 0);

  assert.equal(eventDayLabel({ date: '2026-10-24' }, now), 'Today');
  assert.equal(eventDayLabel({ date: '2026-10-25' }, now), 'Tomorrow');
  assert.equal(eventDayLabel({ date: 'not-a-date' }, now), 'not-a-date');
  assert.equal(eventDayLabel({}, now), '');
});
