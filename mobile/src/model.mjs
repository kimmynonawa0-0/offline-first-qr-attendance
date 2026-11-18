import { defaultEventEnd, eventDate, eventEnd, eventSchedule, eventStart, normalizeEventTime } from './event-schedule.mjs';
import { formatTwelveHourTime } from './event-time.mjs';

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
  const existingStudent = data.students.find(student => student.id === account.id);
  const student = {
    id: account.id, name: account.name, section: account.section, email: account.email || '',
    ...(typeof password === 'string' ? { password } : {}),
    mustChangePassword: Boolean(account.mustChangePassword),
  };
  const updatedStudents = existingStudent
    ? data.students.map(item => item.id === student.id ? { ...item, ...student } : item)
    : [...data.students, student];
  return {
    ...data,
    admins: data.admins.filter(admin => admin.id !== account.id),
    students: updatedStudents,
  };
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
  const adminIds = new Set(data.admins.map(account => account.id));
  const students = new Map(data.students.map(account => [account.id, account]));
  for (const student of bootstrap.students) {
    // One malformed server row must not block sign-in or hide the rest of the roster.
    if (!student?.id || !student?.name || !student?.section) continue;
    if (adminIds.has(student.id)) continue;
    const current = students.get(student.id);
    const profile = { id: student.id, name: student.name, section: student.section, email: student.email || '' };
    students.set(student.id, current
      ? { ...current, ...profile }
      : { ...profile, password: student.section, mustChangePassword: true });
  }
  const events = new Map(data.events.map(event => [event.id, { ...event, assignedToOrganizer: Boolean(event.createdLocally) }]));
  for (const event of bootstrap.events) {
    const date = eventDate(event);
    const time = eventStart(event);
    const end = eventEnd(event);
    requireValue(event?.id && event?.name && date && time && end, 'The server returned an invalid assigned event.');
    const normalized = { ...event, date, time, end };
    const current = events.get(event.id);
    events.set(event.id, current
      ? { ...current, ...normalized, assignedToOrganizer: true, attendees: current.attendees || [] }
      : { ...normalized, assignedToOrganizer: true, attendees: event.attendees || [] });
  }
  const next = { ...data, students: [...students.values()], events: [...events.values()] };
  return Array.isArray(bootstrap.attendance) ? mergeOrganizerAttendance(next, bootstrap.attendance) : next;
}

function attendanceKey(record) {
  return `${record?.eventId || ''}\u0000${record?.studentId || ''}`;
}

function mergeUnsyncedRecord(local, remote) {
  return {
    ...remote,
    ...local,
    id: local.id || remote.id,
    timeInAt: local.timeInAt || remote.timeInAt || null,
    timeIn: local.timeIn || remote.timeIn || local.time || remote.time || '',
    timeInMethod: local.timeInMethod || remote.timeInMethod || local.method || remote.method || null,
    timeOutAt: local.timeOutAt || remote.timeOutAt || null,
    timeOut: local.timeOut || remote.timeOut || '',
    timeOutMethod: local.timeOutMethod || remote.timeOutMethod || null,
    synced: false,
  };
}

export function mergeStudentAttendance(data, studentId, remoteRecords) {
  requireValue(data.students.some(student => student.id === studentId), 'This student account is not saved on this device.');
  requireValue(Array.isArray(remoteRecords), 'The server returned an invalid attendance history.');
  const records = new Map();
  for (const record of data.records) records.set(attendanceKey(record), record);
  for (const record of remoteRecords) {
    requireValue(record?.studentId === studentId && typeof record.id === 'string' && record.id
      && typeof record.eventId === 'string' && record.eventId && typeof record.recordedAt === 'string' && record.recordedAt,
      'The server returned an invalid attendance record.');
    const key = attendanceKey(record);
    const local = records.get(key);
    records.set(key, local && !local.synced
      ? mergeUnsyncedRecord(local, record)
      : { ...record, synced: true });
  }
  return { ...data, records: [...records.values()].sort((a, b) => (b.recordedAt || '').localeCompare(a.recordedAt || '')) };
}

export function mergeOrganizerAttendance(data, remoteRecords) {
  requireValue(Array.isArray(remoteRecords), 'The server returned an invalid attendance history.');
  const records = new Map();
  for (const record of data.records) records.set(attendanceKey(record), record);
  for (const record of remoteRecords) {
    requireValue(record?.id && record.studentId && record.studentName && record.eventId && record.event
      && record.recordedAt, 'The server returned an invalid attendance record.');
    const key = attendanceKey(record);
    const local = records.get(key);
    records.set(key, local && !local.synced
      ? mergeUnsyncedRecord(local, record)
      : { ...record, synced: true });
  }
  const mergedRecords = [...records.values()].sort((a, b) => (b.recordedAt || '').localeCompare(a.recordedAt || ''));
  const recordsByEvent = new Map();
  for (const record of mergedRecords) {
    if (!record.studentName) continue;
    const list = recordsByEvent.get(record.eventId) || [];
    list.push(record);
    recordsByEvent.set(record.eventId, list);
  }
  const events = data.events.map(event => {
    const attendees = new Map((event.attendees || []).map(attendee => [attendee.id, attendee]));
    for (const record of recordsByEvent.get(event.id) || []) {
      attendees.set(record.studentId, {
        id: record.studentId, name: record.studentName,
        time: record.timeIn || record.time, method: record.timeInMethod || record.method,
        timeInAt: record.timeInAt || record.recordedAt,
        timeOutAt: record.timeOutAt || null, timeOut: record.timeOut || '',
        timeOutMethod: record.timeOutMethod || null,
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
  const time = normalizeEventTime(fields.time ?? fields.start);
  const end = normalizeEventTime(fields.end) || defaultEventEnd(time);
  const parsedDate = new Date(`${date}T12:00:00`);
  requireValue(name && location, 'Enter the event name and location.');
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(parsedDate.getTime()) && eventDate({ date }) === date,
    'Enter a valid date as YYYY-MM-DD.');
  requireValue(time, 'Enter a valid start time as HH:MM (24-hour).');
  requireValue(end, 'Enter a valid end time as HH:MM (24-hour).');
  requireValue(end > time, 'End time must be later than the start time.');
  return { ...data, events: [...data.events, { id, name, location, date, time, end, attendees: [], createdBy: user.id }] };
}

export function eventAttendanceCount(data, eventId) {
  const event = data.events.find(item => item.id === eventId);
  return new Set([
    ...(event?.attendees || []).map(attendee => attendee.id),
    ...data.records.filter(record => record.eventId === eventId).map(record => record.studentId),
  ]).size;
}

export function eventAttendanceRows(data, eventId) {
  const event = data.events.find(item => item.id === eventId);
  const rows = new Map();
  for (const attendee of event?.attendees || []) {
    rows.set(attendee.id, {
      studentId: attendee.id,
      studentName: attendee.name,
      timeInAt: attendee.timeInAt || null,
      timeIn: attendee.time || '',
      timeOutAt: attendee.timeOutAt || null,
      timeOut: attendee.timeOut || '',
      timeInMethod: attendee.method || '',
      timeOutMethod: attendee.timeOutMethod || '',
      synced: null,
    });
  }
  for (const record of data.records.filter(item => item.eventId === eventId)) {
    if (!record.studentId) continue;
    const current = rows.get(record.studentId) || {};
    rows.set(record.studentId, {
      studentId: record.studentId,
      studentName: record.studentName || current.studentName || record.studentId,
      timeInAt: record.timeInAt || record.recordedAt || current.timeInAt || null,
      timeIn: record.timeIn || record.time || current.timeIn || '',
      timeOutAt: record.timeOutAt || current.timeOutAt || null,
      timeOut: record.timeOut || current.timeOut || '',
      timeInMethod: record.timeInMethod || record.method || current.timeInMethod || '',
      timeOutMethod: record.timeOutMethod || current.timeOutMethod || '',
      synced: record.synced === true,
    });
  }
  return [...rows.values()].sort((left, right) =>
    (right.timeInAt || '').localeCompare(left.timeInAt || '')
    || left.studentName.localeCompare(right.studentName));
}

export function deleteEvent(data, user, id) {
  requireAdmin(data, user);
  const event = data.events.find(item => item.id === id);
  requireValue(event, 'Event no longer exists.');
  requireValue(event.createdBy === user.id || (event.createdLocally && !event.createdBy),
    'Only the organizer who created this event can delete it.');
  requireValue(eventAttendanceCount(data, id) === 0,
    'This event already has attendance records. Ask the system manager to delete it.');
  return { ...data, events: data.events.filter(e => e.id !== id) };
}

export function attendanceStatus(data, eventId, studentId) {
  const record = data.records.find(item => item.eventId === eventId && item.studentId === studentId);
  const attendee = data.events.find(item => item.id === eventId)?.attendees?.find(item => item.id === studentId);
  const timeInAt = record?.timeInAt || record?.recordedAt || attendee?.timeInAt || null;
  const timeOutAt = record?.timeOutAt || attendee?.timeOutAt || null;
  return { record, timeInAt, timeOutAt, status: !timeInAt ? 'not-in' : !timeOutAt ? 'timed-in' : 'completed' };
}

export function checkIn(data, user, eventId, person, method, recordId, now = new Date()) {
  requireAdmin(data, user);
  requireValue(['organizer', 'scan'].includes(method), 'Invalid check-in method.');
  const event = data.events.find(e => e.id === eventId);
  requireValue(event, 'Event no longer exists.');
  const schedule = eventSchedule(event, now);
  requireValue(schedule.action, schedule.message);
  const action = schedule.action;
  const student = method === 'organizer' ? user : person;
  if (method === 'scan') requireValue(data.students.some(account => account.id === student?.id),
    'This QR code is not in the imported student roster.');
  const id = student.id.trim();
  const name = student.name.trim();
  requireValue(id && name, 'Enter the student ID and full name.');
  const current = attendanceStatus(data, eventId, id);
  if (action === 'time-in') {
    requireValue(current.status === 'not-in', current.status === 'completed'
      ? 'This student has already completed attendance for this event.'
      : `This student is already timed in. Time Out opens after ${eventEnd(event) ? formatTwelveHourTime(eventEnd(event)) : 'the event ends'}.`);
  }
  if (action === 'time-out') {
    requireValue(current.status !== 'not-in', 'This student has no Time In recorded for this event.');
    requireValue(current.status !== 'completed', 'This student is already timed out for this event.');
    requireValue(current.record, 'The Time In record is unavailable on this device. Refresh attendance before recording Time Out.');
  }
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const timestamp = now.toISOString();
  if (action === 'time-out') {
    const updatedRecord = { ...current.record, timeOutAt: timestamp, timeOut: time, timeOutMethod: method, synced: false };
    return {
      ...data,
      events: data.events.map(item => {
        if (item.id !== eventId) return item;
        const attendees = item.attendees || [];
        const exists = attendees.some(attendee => attendee.id === id);
        return { ...item, attendees: exists
          ? attendees.map(attendee => attendee.id === id
            ? { ...attendee, timeOutAt: timestamp, timeOut: time, timeOutMethod: method }
            : attendee)
          : [...attendees, { id, name, time: current.record.timeIn || current.record.time,
            method: current.record.timeInMethod || current.record.method, timeInAt: current.timeInAt,
            timeOutAt: timestamp, timeOut: time, timeOutMethod: method }] };
      }),
      records: data.records.map(record => record.id === current.record.id ? updatedRecord : record),
    };
  }
  const record = {
    id: recordId, studentId: id, studentName: name, eventId, event: event.name,
    location: event.location, date: localDate(now), time, timeIn: time,
    recordedAt: timestamp, timeInAt: timestamp, timeInMethod: method,
    timeOutAt: null, timeOut: '', timeOutMethod: null,
    status: 'PRESENT', method, synced: false,
  };
  return {
    ...data,
    events: data.events.map(e => e.id === eventId ? { ...e, attendees: [...e.attendees, {
      id, name, time, method, timeInAt: timestamp, timeOutAt: null,
    }] } : e),
    records: [record, ...data.records],
  };
}

export const methodLabel = method => method === 'organizer' ? 'Organizer check-in' : 'QR scan';
