export function parseTwelveHourTime(value) {
  const match = /^(1[0-2]|0?[1-9]):([0-5]\d)\s*(AM|PM)$/i.exec(value.trim());
  if (!match) throw new Error('Enter the event time as 9:30 AM or 2:30 PM.');
  const hour = Number(match[1]) % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}

export function formatTwelveHourTime(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value || '');
  if (!match) return value || '';
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export function currentTwelveHourTime(date = new Date()) {
  return formatTwelveHourTime(`${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`);
}
