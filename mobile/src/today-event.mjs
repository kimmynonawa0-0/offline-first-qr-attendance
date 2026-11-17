import { eventDate, eventStart } from './event-schedule.mjs';

function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function localTime(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function eventsForToday(events, now = new Date()) {
  return events
    .filter(event => eventDate(event) === localDate(now))
    .sort((left, right) => eventStart(left).localeCompare(eventStart(right)));
}

export function eventForToday(events, now = new Date()) {
  const today = eventsForToday(events, now);
  const startedToday = today.filter(event => eventStart(event) <= localTime(now));
  return startedToday.at(-1) || today[0] || null;
}

function compareEvents(left, right) {
  return `${eventDate(left)}T${eventStart(left) || '00:00'}`
    .localeCompare(`${eventDate(right)}T${eventStart(right) || '00:00'}`)
    || (left.name || '').localeCompare(right.name || '');
}

export function sortEventsByDate(events, direction = 'desc') {
  const sign = direction === 'asc' ? 1 : -1;
  return [...events].sort((left, right) => compareEvents(left, right) * sign);
}

// Events stay open for scanning until the day ends; they become read-only the day after.
export function isEventPast(event, now = new Date()) {
  const date = eventDate(event);
  return Boolean(date) && date < localDate(now);
}

export function groupEventsByPhase(events, now = new Date()) {
  const today = [];
  const upcoming = [];
  const past = [];
  for (const event of events) {
    if (isEventPast(event, now)) past.push(event);
    else if (eventDate(event) === localDate(now)) today.push(event);
    else upcoming.push(event);
  }
  return {
    today: today.sort(compareEvents),
    upcoming: upcoming.sort(compareEvents),
    past: past.sort((left, right) => compareEvents(right, left)),
  };
}

export function eventDayLabel(event, now = new Date()) {
  const date = eventDate(event);
  if (!date) return String(event?.date ?? '');
  if (date === localDate(now)) return 'Today';
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date === localDate(tomorrow)) return 'Tomorrow';
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
