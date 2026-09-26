const collection = role => role === 'admin' ? 'admins' : 'students';
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
export const DEMO_ADMIN = { id: '23-02330', name: 'Demo Organizer', section: 'BSCS-3C', email: '', password: 'BSCS-3C', mustChangePassword: true };

export function initialData() {
  return {
    version: 2,
    students: [],
    admins: [{ ...DEMO_ADMIN }], events: [], records: [],
  };
}

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function login(data, identifier, password) {
  const id = identifier.trim();
  const role = data.admins.some(a => a.id === id) ? 'admin' : 'student';
  const account = data[collection(role)].find(a => a.id === id && a.password === password);
  requireValue(account, 'Invalid student ID or password. Contact your faculty if your account has not been imported.');
  return sessionFor(account, role);
}

export function sessionFor(account, role) {
  const { id, name, email, section, mustChangePassword } = account;
  return { id, name, email, section, mustChangePassword, role };
}

export function changePassword(data, user, password, confirm) {
  requireValue(user && ['admin', 'student'].includes(user.role), 'Please log in again.');
  const key = collection(user.role);
  const account = data[key].find(a => a.id === user.id);
  requireValue(account?.mustChangePassword, 'Password change is not pending. Please log in again.');
  requireValue(password.trim().length >= 12, 'Use at least 12 characters for your new password.');
  requireValue(password === confirm, 'Passwords do not match.');
  requireValue(password.trim().toLowerCase() !== account.section.trim().toLowerCase() && password !== account.password,
    'Choose a new password, not your section or current password.');
  return { ...data, [key]: data[key].map(a => a.id === account.id ? { ...a, password, mustChangePassword: false } : a) };
}

export function requireAdmin(data, user) {
  const account = data.admins.find(a => a.id === user?.id);
  requireValue(user?.role === 'admin' && account, 'Log in as an admin to manage attendance.');
  requireValue(!account.mustChangePassword, 'Change your password before continuing.');
}

export function createEvent(data, user, fields, id) {
  requireAdmin(data, user);
  const name = fields.name.trim();
  const location = fields.location.trim();
  const date = fields.date.trim();
  const time = fields.time.trim();
  const parsedDate = new Date(`${date}T12:00:00`);
  requireValue(name && location, 'Enter the event name and location.');
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(parsedDate.getTime()) && localDate(parsedDate) === date,
    'Enter a valid date as YYYY-MM-DD.');
  requireValue(/^([01]\d|2[0-3]):[0-5]\d$/.test(time), 'Enter a valid time as HH:MM (24-hour).');
  return { ...data, events: [...data.events, { id, name, location, date, time, attendees: [] }] };
}

export function deleteEvent(data, user, id) {
  requireAdmin(data, user);
  // Keep historical attendance receipts, matching the browser prototype.
  return { ...data, events: data.events.filter(e => e.id !== id) };
}

export function checkIn(data, user, eventId, person, method, recordId, now = new Date()) {
  requireAdmin(data, user);
  requireValue(['organizer', 'scan', 'demo'].includes(method), 'Invalid check-in method.');
  const event = data.events.find(e => e.id === eventId);
  requireValue(event, 'Event no longer exists.');
  const student = method === 'organizer' ? user : person;
  const id = student.id.trim();
  const name = student.name.trim();
  requireValue(id && name, 'Enter the student ID and full name.');
  requireValue(!event.attendees.some(a => a.id === id), 'This student is already present for this event.');
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const record = {
    id: recordId, studentId: id, studentName: name, eventId, event: event.name,
    location: event.location, date: localDate(now), time, recordedAt: now.toISOString(),
    status: 'PRESENT', method, synced: false,
  };
  return {
    ...data,
    events: data.events.map(e => e.id === eventId ? { ...e, attendees: [...e.attendees, { id, name, time, method }] } : e),
    records: [record, ...data.records],
  };
}

export function demoSync(data, user, online) {
  requireAdmin(data, user);
  requireValue(online, 'You are offline. Records are saved on this device.');
  return { ...data, records: data.records.map(r => ({ ...r, synced: true })) };
}

export const methodLabel = method => method === 'organizer' ? 'Organizer check-in' : method === 'demo' ? 'Demo scan' : 'QR scan';
