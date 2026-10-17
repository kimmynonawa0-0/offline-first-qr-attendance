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

export function cacheRemoteStudent(data, account, password) {
  requireValue(account?.role === 'student' && account.id && account.name && account.section,
    'The server returned an invalid student account.');
  requireValue(!data.admins.some(admin => admin.id === account.id),
    'This student ID is already registered as an organizer on this device.');
  const student = {
    id: account.id, name: account.name, section: account.section, email: account.email || '',
    ...(typeof password === 'string' ? { password } : {}),
    mustChangePassword: Boolean(account.mustChangePassword),
  };
  const exists = data.students.some(item => item.id === student.id);
  const updatedStudents = data.students.map(item => {
    if (item.id !== student.id) return item;
    const updated = { ...item, ...student };
    if (typeof password !== 'string') delete updated.password;
    return updated;
  });
  return { ...data, students: exists
    ? updatedStudents
    : [...data.students, student] };
}

export function cacheRemoteAdminPassword(data, adminId, password, serverAccount = {}) {
  const existing = data.admins.find(admin => admin.id === adminId);
  const student = data.students.find(account => account.id === adminId);
  const serverProfile = Object.fromEntries(Object.entries(serverAccount).filter(([, value]) => value !== undefined));
  const savedPassword = typeof password === 'string' ? { password } : {};
  const organizer = existing || { ...(student || {}), ...serverProfile, id: adminId,
    section: serverAccount.section || student?.section || 'Organizer', email: serverAccount.email || student?.email || '',
    mustChangePassword: Boolean(serverAccount.mustChangePassword) };
  const savedOrganizer = { ...organizer, ...savedPassword };
  if (typeof password !== 'string') delete savedOrganizer.password;
  return {
    ...data,
    students: data.students.filter(account => account.id !== adminId),
    admins: existing
      ? data.admins.map(admin => admin.id === adminId ? { ...savedOrganizer, ...serverProfile } : admin)
      : [...data.admins, { ...savedOrganizer, ...serverProfile }],
  };
}

export function mergeOrganizerBootstrap(data, bootstrap) {
  requireValue(Array.isArray(bootstrap?.students) && Array.isArray(bootstrap?.events), 'The server returned invalid organizer data.');
  let next = { ...data, events: data.events.map(event => ({ ...event, assignedToOrganizer: false })) };
  for (const student of bootstrap.students) {
    requireValue(student?.id && student?.name && student?.section, 'The server returned an invalid student roster entry.');
    if (next.admins.some(account => account.id === student.id)) continue;
    const current = next.students.find(account => account.id === student.id);
    const profile = { id: student.id, name: student.name, section: student.section, email: student.email || '' };
    next = { ...next, students: current
      ? next.students.map(account => account.id === student.id ? { ...account, ...profile } : account)
      : [...next.students, { ...profile, password: student.section, mustChangePassword: true }] };
  }
  for (const event of bootstrap.events) {
    requireValue(event?.id && event?.name && event?.date && event?.time, 'The server returned an invalid assigned event.');
    const current = next.events.find(item => item.id === event.id);
    next = { ...next, events: current
      ? next.events.map(item => item.id === event.id ? { ...item, ...event, assignedToOrganizer: true, attendees: item.attendees || [] } : item)
      : [...next.events, { ...event, assignedToOrganizer: true, attendees: event.attendees || [] }] };
  }
  return next;
}

export function mergeStudentAttendance(data, studentId, remoteRecords) {
  requireValue(data.students.some(student => student.id === studentId), 'This student account is not saved on this device.');
  requireValue(Array.isArray(remoteRecords), 'The server returned an invalid attendance history.');
  const records = new Map(data.records.map(record => [record.id, record]));
  for (const record of remoteRecords) {
    requireValue(record?.studentId === studentId && typeof record.id === 'string' && record.id
      && typeof record.eventId === 'string' && record.eventId && typeof record.recordedAt === 'string' && record.recordedAt,
      'The server returned an invalid attendance record.');
    records.set(record.id, { ...record, synced: true });
  }
  return { ...data, records: [...records.values()].sort((a, b) => (b.recordedAt || '').localeCompare(a.recordedAt || '')) };
}

export function mergeOrganizerAttendance(data, remoteRecords) {
  requireValue(Array.isArray(remoteRecords), 'The server returned an invalid attendance history.');
  const records = new Map(data.records.map(record => [record.id, record]));
  for (const record of remoteRecords) {
    requireValue(record?.id && record.studentId && record.studentName && record.eventId && record.event
      && record.recordedAt, 'The server returned an invalid attendance record.');
    records.set(record.id, { ...record, synced: true });
  }
  const mergedRecords = [...records.values()].sort((a, b) => (b.recordedAt || '').localeCompare(a.recordedAt || ''));
  const events = data.events.map(event => {
    const attendees = new Map((event.attendees || []).map(attendee => [attendee.id, attendee]));
    for (const record of remoteRecords.filter(item => item.eventId === event.id)) {
      attendees.set(record.studentId, {
        id: record.studentId, name: record.studentName, time: record.time, method: record.method,
      });
    }
    return { ...event, attendees: [...attendees.values()] };
  });
  return { ...data, events, records: mergedRecords };
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
  requireValue(['organizer', 'scan'].includes(method), 'Invalid check-in method.');
  const event = data.events.find(e => e.id === eventId);
  requireValue(event, 'Event no longer exists.');
  const student = method === 'organizer' ? user : person;
  if (method === 'scan') requireValue(data.students.some(account => account.id === student?.id),
    'This QR code is not in the imported student roster.');
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

export const methodLabel = method => method === 'organizer' ? 'Organizer check-in' : 'QR scan';
