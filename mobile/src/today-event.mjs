import { localDate } from './model.mjs';

function localTime(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function eventsForToday(events, now = new Date()) {
  return events
    .filter(event => event.date === localDate(now))
    .sort((left, right) => left.time.localeCompare(right.time));
}

export function eventForToday(events, now = new Date()) {
  const today = eventsForToday(events, now);
  const startedToday = today.filter(event => event.time <= localTime(now));
  return startedToday.at(-1) || today[0] || null;
}

function compareEvents(left, right) {
  return `${left.date || ''}T${left.time || '00:00'}`
    .localeCompare(`${right.date || ''}T${right.time || '00:00'}`)
    || (left.name || '').localeCompare(right.name || '');
}

export function sortEventsByDate(events, direction = 'desc') {
  const sign = direction === 'asc' ? 1 : -1;
  return [...events].sort((left, right) => compareEvents(left, right) * sign);
}

// Events stay open for scanning until the day ends; they become read-only the day after.
export function isEventPast(event, now = new Date()) {
  return Boolean(event?.date) && event.date < localDate(now);
}

export function groupEventsByPhase(events, now = new Date()) {
  const today = [];
  const upcoming = [];
  const past = [];
  for (const event of events) {
    if (isEventPast(event, now)) past.push(event);
    else if (event.date === localDate(now)) today.push(event);
    else upcoming.push(event);
  }
  return {
    today: today.sort(compareEvents),
    upcoming: upcoming.sort(compareEvents),
    past: past.sort((left, right) => compareEvents(right, left)),
  };
}

export function eventDayLabel(event, now = new Date()) {
  if (!event?.date) return '';
  if (event.date === localDate(now)) return 'Today';
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (event.date === localDate(tomorrow)) return 'Tomorrow';
  const parsed = new Date(`${event.date}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? event.date
    : parsed.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
