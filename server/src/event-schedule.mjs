const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

export function normalizeEventTime(value) {
  const match = TIME_PATTERN.exec(String(value ?? '').trim());
  return match ? `${match[1]}:${match[2]}` : '';
}

export function defaultEventEnd(start) {
  const match = TIME_PATTERN.exec(normalizeEventTime(start));
  if (!match) return '';
  const total = Number(match[1]) * 60 + Number(match[2]) + 60;
  const bounded = Math.min(total, 23 * 60 + 59);
  return `${String(Math.floor(bounded / 60)).padStart(2, '0')}:${String(bounded % 60).padStart(2, '0')}`;
}

export function eventStart(event) {
  return normalizeEventTime(event?.start || event?.time);
}

export function eventEnd(event) {
  return normalizeEventTime(event?.end || event?.endTime) || defaultEventEnd(eventStart(event));
}

export function normalizeEvent(event) {
  const time = eventStart(event);
  const end = eventEnd(event);
  return {
    ...event,
    id: String(event?.id ?? '').trim(),
    name: String(event?.name ?? '').trim(),
    location: String(event?.location ?? '').trim(),
    date: String(event?.date ?? '').trim(),
    time,
    end,
  };
}
