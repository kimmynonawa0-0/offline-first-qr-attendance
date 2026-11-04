import { localDate } from './model.mjs';

function localTime(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function eventForToday(events, now = new Date()) {
  const today = events
    .filter(event => event.date === localDate(now))
    .sort((left, right) => left.time.localeCompare(right.time));
  const startedToday = today.filter(event => event.time <= localTime(now));
  return startedToday.at(-1) || today[0] || null;
}

export function sortEventsByDate(events, direction = 'desc') {
  const sign = direction === 'asc' ? 1 : -1;
  return [...events].sort((left, right) => {
    const compared = `${left.date || ''}T${left.time || '00:00'}`
      .localeCompare(`${right.date || ''}T${right.time || '00:00'}`)
      || (left.name || '').localeCompare(right.name || '');
    return compared * sign;
  });
}
