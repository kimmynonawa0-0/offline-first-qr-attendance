export const ALLOWED_ADMIN_EMAILS = ['okims@gmail.com', 'test@example.com'];
export const CODE_LIFETIME = 15 * 60 * 1000;
export const normalizeEmail = value => value.trim().toLowerCase();
const collection = role => role === 'admin' ? 'admins' : 'students';
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };

export function initialData() {
  return {
    version: 1,
    students: [{ id: '2024-00123', name: 'Juan Dela Cruz', email: 'juan@school.com', password: 'password' }],
    admins: [], events: [], records: [],
  };
}

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function login(data, role, identifier, password) {
  const account = data[collection(role)].find(a =>
    (role === 'admin' ? a.email === normalizeEmail(identifier) : a.id === identifier.trim()) && a.password === password);
  requireValue(account && (role !== 'admin' || ALLOWED_ADMIN_EMAILS.includes(account.email)), 'Invalid credentials. Please try again.');
  return { id: account.id, name: account.name, email: account.email, role };
}

export function issueChallenge(data, { purpose, role, email, studentId = '', code }, now = Date.now()) {
  email = normalizeEmail(email);
  requireValue(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Enter a valid email address.');
  const accounts = data[collection(role)];
  let id = null;
  if (purpose === 'signup') {
    requireValue(role === 'admin' && ALLOWED_ADMIN_EMAILS.includes(email), 'This email is not approved for admin signup.');
    requireValue(!accounts.some(a => a.email === email), 'This email already has an admin account. Please log in.');
  } else {
    let matches = accounts.filter(a => normalizeEmail(a.email) === email);
    requireValue(matches.length, `No ${role} account matches this email.`);
    if (matches.length > 1) {
      matches = matches.filter(a => a.id === studentId.trim());
      requireValue(matches.length === 1, 'This email is shared. Enter your student ID to select your account.');
    }
    id = matches[0].id;
  }
  return { purpose, role, email, id, code, verified: false, expiresAt: now + CODE_LIFETIME };
}

export function verifyChallenge(challenge, code, now = Date.now()) {
  requireValue(challenge && now < challenge.expiresAt, 'Code expired. Request a new code.');
  requireValue(!challenge.verified && code.trim() === challenge.code, 'Incorrect verification code.');
  return { ...challenge, code: null, verified: true };
}

function requireVerified(challenge, purpose, role, now) {
  requireValue(challenge?.verified && challenge.purpose === purpose && challenge.role === role && now < challenge.expiresAt,
    'Verify your email again. The verification is missing or expired.');
}

function checkPassword(password, confirm) {
  requireValue(password.trim(), 'Enter a password.');
  requireValue(password === confirm, 'Passwords do not match.');
}

export function register(data, role, fields, challenge, now = Date.now()) {
  const id = fields.id.trim();
  const name = fields.name.trim();
  const email = normalizeEmail(role === 'admin' ? challenge?.email || '' : fields.email);
  requireValue(id && name && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Enter your student ID, full name, and a valid email.');
  checkPassword(fields.password, fields.confirm);
  if (role === 'admin') {
    requireVerified(challenge, 'signup', role, now);
    requireValue(ALLOWED_ADMIN_EMAILS.includes(email), 'This email is not approved.');
  }
  const key = collection(role);
  requireValue(!data[key].some(a => a.id === id || (role === 'admin' && a.email === email)), 'Student ID or admin email already registered.');
  return { ...data, [key]: [...data[key], { id, name, email, password: fields.password }] };
}

export function resetPassword(data, challenge, password, confirm, now = Date.now()) {
  requireVerified(challenge, 'reset', challenge?.role, now);
  checkPassword(password, confirm);
  const key = collection(challenge.role);
  const index = data[key].findIndex(a => a.id === challenge.id && normalizeEmail(a.email) === challenge.email);
  requireValue(index !== -1, 'Account changed. Request a new code.');
  return { ...data, [key]: data[key].map((a, i) => i === index ? { ...a, password } : a) };
}

function requireAdmin(user) {
  requireValue(user?.role === 'admin' && user.id && user.name, 'Log in as an admin to manage attendance.');
}

export function createEvent(data, user, fields, id) {
  requireAdmin(user);
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
  requireAdmin(user);
  // Keep historical attendance receipts, matching the browser prototype.
  return { ...data, events: data.events.filter(e => e.id !== id) };
}

export function checkIn(data, user, eventId, person, method, recordId, now = new Date()) {
  requireAdmin(user);
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
  requireAdmin(user);
  requireValue(online, 'You are offline. Records are saved on this device.');
  return { ...data, records: data.records.map(r => ({ ...r, synced: true })) };
}

export const methodLabel = method => method === 'organizer' ? 'Organizer check-in' : method === 'demo' ? 'Demo scan' : 'QR scan';
