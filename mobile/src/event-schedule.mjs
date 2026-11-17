import { formatTwelveHourTime } from './event-time.mjs';

export const DEFAULT_EVENT_DURATION_MINUTES = 60;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

export function normalizeEventTime(value) {
  const text = String(value ?? '').trim();
  const match = TIME_PATTERN.exec(text);
  return match ? `${match[1]}:${match[2]}` : '';
}

export function normalizeEventDate(value) {
  const text = String(value ?? '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!match) return '';
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${match[1]}-${match[2]}-${match[3]}` === localDateFrom(parsed)
    ? `${match[1]}-${match[2]}-${match[3]}`
    : '';
}

function localDateFrom(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function localTimeFrom(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function minutes(value) {
  const match = TIME_PATTERN.exec(value || '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function timeFromMinutes(total) {
  const bounded = Math.max(0, Math.min(23 * 60 + 59, Math.round(total)));
  return `${String(Math.floor(bounded / 60)).padStart(2, '0')}:${String(bounded % 60).padStart(2, '0')}`;
}

export function defaultEventEnd(start) {
  const startMinutes = minutes(normalizeEventTime(start));
  return startMinutes === null ? '' : timeFromMinutes(startMinutes + DEFAULT_EVENT_DURATION_MINUTES);
}

export function eventStart(event) {
  return normalizeEventTime(event?.start || event?.time);
}

export function eventEnd(event) {
  return normalizeEventTime(event?.end || event?.endTime) || defaultEventEnd(eventStart(event));
}

export function eventDate(event) {
  return normalizeEventDate(event?.date);
}

export function formatEventWindow(event) {
  const start = eventStart(event);
  const end = eventEnd(event);
  if (!start) return '';
  return end
    ? `${formatTwelveHourTime(start)} - ${formatTwelveHourTime(end)}`
    : formatTwelveHourTime(start);
}

export function eventSchedule(event, now = new Date()) {
  const date = eventDate(event);
  const start = eventStart(event);
  const end = eventEnd(event);
  if (!date || !start || !end) {
    return { phase: 'invalid', action: null, start, end, date, message: 'This event has invalid schedule details.' };
  }
  const today = localDateFrom(now);
  if (date < today) {
    return { phase: 'ended', action: null, start, end, date, message: 'This event has already ended.' };
  }
  if (date > today) {
    return { phase: 'upcoming', action: null, start, end, date, message: `Time In opens on ${date} at ${formatTwelveHourTime(start)}.` };
  }
  const current = localTimeFrom(now);
  if (current < start) {
    return {
      phase: 'upcoming', action: null, start, end, date,
      message: `Time In opens at ${formatTwelveHourTime(start)}.`,
    };
  }
  if (current <= end) {
    return {
      phase: 'time-in', action: 'time-in', start, end, date,
      message: `Time In is open until ${formatTwelveHourTime(end)}. Scans now record Time In.`,
    };
  }
  return {
    phase: 'time-out', action: 'time-out', start, end, date,
    message: `Time In closed at ${formatTwelveHourTime(end)}. Scans now record Time Out.`,
  };
}
