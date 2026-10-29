function requestError(message, status = null, retryable = false) {
  const error = new Error(message);
  error.status = status;
  error.retryable = retryable;
  return error;
}

export const isRetryableAuthFailure = error => Boolean(error?.retryable);

async function postJson(apiUrl, path, body, fetchImpl, token) {
  if (!apiUrl) throw new Error('Set EXPO_PUBLIC_API_URL to the server address first.');
  let response;
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  const timeout = controller ? setTimeout(() => controller.abort(), 60000) : null;
  try {
    response = await fetchImpl(`${apiUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch (error) {
    const timedOut = error?.name === 'AbortError';
    throw requestError(timedOut
      ? 'The attendance server did not respond in time.'
      : 'Could not reach the attendance server. Connect to the internet and try again.', null, true);
  } finally { if (timeout) clearTimeout(timeout); }
  let result = {};
  try { result = await response.json(); } catch {
    if (!response.ok) throw requestError('Server request failed.', response.status, response.status >= 500);
    throw requestError('Server returned an unreadable response.', response.status);
  }
  if (!response.ok) throw requestError(result.error || 'Server request failed.', response.status, response.status >= 500);
  return result;
}

export async function uploadRosterToServer(students, user, token, apiUrl, fetchImpl = fetch) {
  if (user?.role !== 'admin') throw new Error('Log in as an organizer to upload a roster.');
  if (!token) throw new Error('Sign in online as an organizer to upload a roster.');
  const result = await postJson(apiUrl, '/roster/upload', { students }, fetchImpl, token);
  if (!Number.isInteger(result.added) || !Number.isInteger(result.skipped)) throw new Error('Server did not confirm the roster upload.');
  return result;
}

export async function loginStudentRemotely(identifier, password, apiUrl, fetchImpl = fetch, previousToken) {
  const result = await postJson(apiUrl, '/auth/login', { id: identifier.trim(), password, client: 'mobile' }, fetchImpl, previousToken);
  if (!['student', 'admin'].includes(result.account?.role) || !result.account.id) throw new Error('Server returned an invalid account.');
  if (typeof result.sessionToken !== 'string') throw new Error('Server did not issue an authenticated session.');
  result.account.sessionToken = result.sessionToken;
  return result.account;
}

export async function downloadOrganizerBootstrap(token, apiUrl, fetchImpl = fetch) {
  if (!token) throw new Error('Sign in online as an organizer to download assigned events.');
  if (!apiUrl) throw new Error('Set EXPO_PUBLIC_API_URL to the server address first.');
  let response;
  try {
    response = await fetchImpl(`${apiUrl.replace(/\/$/, '')}/organizer/bootstrap`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch { throw new Error('Could not reach the attendance server. Connect to the internet and try again.'); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Could not download assigned organizer data.');
  if (!Array.isArray(result.students) || !Array.isArray(result.events)) throw new Error('Server returned invalid organizer data.');
  return Array.isArray(result.attendance)
    ? { ...result, attendance: result.attendance.map(mapAttendanceRecord) }
    : result;
}

export async function createOrganizerEvent(event, user, token, apiUrl, fetchImpl = fetch) {
  if (user?.role !== 'admin') throw new Error('Log in as an organizer to create an event.');
  if (!token) throw new Error('Sign in online as an organizer to create an event.');
  const result = await postJson(apiUrl, '/organizer/events', { event, organizerIds: [user.id] }, fetchImpl, token);
  if (!result.event?.id || result.event.id !== event.id) throw new Error('Server did not confirm the event creation.');
  return result.event;
}

export async function changeStudentPasswordRemotely(user, token, currentPassword, newPassword, apiUrl, fetchImpl = fetch) {
  if (user?.role !== 'student' || !token) throw new Error('Sign in online as a student to change this password.');
  return postJson(apiUrl, '/auth/password', { id: user.id, currentPassword, newPassword }, fetchImpl, token);
}

export async function changeAdminPasswordRemotely(user, token, currentPassword, newPassword, apiUrl, fetchImpl = fetch) {
  if (user?.role !== 'admin' || !token) throw new Error('Sign in online as an organizer to change this password.');
  const result = await postJson(apiUrl, '/auth/admin/password', { currentPassword, newPassword }, fetchImpl, token);
  if (typeof result.sessionToken !== 'string') throw new Error('Server did not issue a replacement organizer session.');
  return result;
}

export async function logoutAdminRemotely(token, apiUrl, fetchImpl = fetch) {
  if (!token || !apiUrl) return;
  return postJson(apiUrl, '/auth/logout', {}, fetchImpl, token);
}

function localTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
}

function mapAttendanceRecord(record) {
  const recordedAt = record.recorded_at || record.recordedAt;
  const timeInAt = record.time_in_at || record.timeInAt || recordedAt;
  const timeOutAt = record.time_out_at || record.timeOutAt || null;
  const timeInMethod = record.time_in_method || record.timeInMethod || record.method || 'scan';
  const timeOutMethod = record.time_out_method || record.timeOutMethod || null;
  return {
    id: record.id,
    studentId: record.student_id || record.studentId,
    studentName: record.student_name || record.studentName,
    eventId: record.event_id || record.eventId,
    event: record.event_name || record.event,
    location: record.location || '',
    recordedAt: timeInAt,
    timeInAt,
    timeOutAt,
    date: record.attendance_date || record.date || timeInAt?.slice(0, 10),
    time: record.attendance_time || record.time || localTime(timeInAt),
    timeIn: record.attendance_time || record.timeIn || record.time || localTime(timeInAt),
    timeOut: record.timeOut || localTime(timeOutAt),
    status: 'PRESENT',
    method: timeInMethod,
    timeInMethod,
    timeOutMethod,
  };
}

export async function downloadStudentAttendance(user, token, apiUrl, fetchImpl = fetch) {
  if (user?.role !== 'student') throw new Error('Log in as a student to refresh attendance.');
  if (!token) throw new Error('Sign in online as a student to refresh attendance.');
  const result = await postJson(apiUrl, '/student/attendance', {}, fetchImpl, token);
  if (!Array.isArray(result.records)) throw new Error('Server returned an invalid attendance history.');
  return result.records.map(mapAttendanceRecord);
}

export async function downloadOrganizerAttendance(user, token, apiUrl, fetchImpl = fetch) {
  if (user?.role !== 'admin') throw new Error('Log in as an organizer to refresh attendance.');
  if (!token) throw new Error('Sign in online as an organizer to refresh attendance.');
  if (!apiUrl) throw new Error('Set EXPO_PUBLIC_API_URL to the server address first.');
  let response;
  try {
    response = await fetchImpl(`${apiUrl.replace(/\/$/, '')}/organizer/attendance`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch { throw new Error('Could not reach the attendance server. Connect to the internet and try again.'); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw requestError(result.error || 'Could not download organizer attendance.', response.status, response.status >= 500);
  if (!Array.isArray(result.records)) throw new Error('Server returned an invalid attendance history.');
  return result.records.map(mapAttendanceRecord);
}

export async function syncToServer(data, user, token, apiUrl, fetchImpl = fetch) {
  if (user?.role !== 'admin') throw new Error('Log in as an organizer to sync.');
  if (!apiUrl) throw new Error('Set EXPO_PUBLIC_API_URL to the server address first.');
  if (!token) throw new Error('Sign in online as an organizer to sync.');
  const pending = data.records.filter(record => !record.synced);
  const pendingEventIds = new Set(pending.map(record => record.eventId));
  const pendingStudentIds = new Set(pending.map(record => record.studentId));
  const result = await postJson(apiUrl, '/sync', {
      students: data.students.filter(student => pendingStudentIds.has(student.id)).map(({ id, name, section, email }) => ({ id, name, section, email })),
      events: data.events.filter(event => pendingEventIds.has(event.id)).map(({ attendees, ...event }) => event),
      records: pending,
    }, fetchImpl, token);
  if (!Array.isArray(result.acceptedRecordIds) || !Array.isArray(result.conflictRecordIds)) {
    throw new Error('Server did not confirm which records it saved.');
  }
  return result;
}

export async function syncOrganizerWithReauth(data, user, token, apiUrl, fetchImpl = fetch) {
  if (user?.role !== 'admin') throw new Error('Log in as an organizer to sync.');
  if (!token) throw new Error('Your organizer session is unavailable. Log out, then sign in online again before uploading. Pending attendance is still saved locally.');
  try {
    return await syncToServer(data, user, token, apiUrl, fetchImpl);
  } catch (error) {
    const wrapped = requestError(error.status === 401
      ? 'Your organizer session expired or was revoked.'
      : `${error.message} Pending attendance is still saved locally.`, error.status, error.retryable);
    throw wrapped;
  }
}

export function markSynced(data, acceptedRecordIds) {
  const accepted = new Set(acceptedRecordIds);
  return { ...data, records: data.records.map(record => accepted.has(record.id) ? { ...record, synced: true } : record) };
}
