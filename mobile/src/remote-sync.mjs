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
  if (result.account.role === 'admin' && typeof result.sessionToken !== 'string') throw new Error('Server did not issue an organizer session.');
  if (result.account.role === 'admin') result.account.sessionToken = result.sessionToken;
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
  return result;
}

export async function changeStudentPasswordRemotely(user, currentPassword, newPassword, apiUrl, fetchImpl = fetch) {
  if (user?.role !== 'student') throw new Error('Log in as a student to change this password.');
  return postJson(apiUrl, '/auth/password', { id: user.id, currentPassword, newPassword }, fetchImpl);
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

export async function downloadStudentAttendance(user, password, apiUrl, fetchImpl = fetch) {
  if (user?.role !== 'student') throw new Error('Log in as a student to refresh attendance.');
  const result = await postJson(apiUrl, '/student/attendance', { id: user.id, password }, fetchImpl);
  if (!Array.isArray(result.records)) throw new Error('Server returned an invalid attendance history.');
  return result.records;
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
  if (!response.ok) throw new Error(result.error || 'Could not download organizer attendance.');
  if (!Array.isArray(result.records)) throw new Error('Server returned an invalid attendance history.');
  return result.records.map(record => {
    const recordedAt = record.recorded_at || record.recordedAt;
    return {
      id: record.id,
      studentId: record.student_id || record.studentId,
      studentName: record.student_name || record.studentName,
      eventId: record.event_id || record.eventId,
      event: record.event_name || record.event,
      location: record.location || '',
      recordedAt,
      date: record.attendance_date || record.date || recordedAt?.slice(0, 10),
      time: record.attendance_time || record.time || (recordedAt
        ? new Date(recordedAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
        : ''),
      status: 'PRESENT',
      method: record.method || 'scan',
    };
  });
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

export async function syncOrganizerWithReauth(data, user, token, password, apiUrl, fetchImpl = fetch) {
  if (user?.role !== 'admin') throw new Error('Log in as an organizer to sync.');
  if (!password) throw new Error('This device has no protected organizer credential. Sign in online once, then retry. Pending attendance is still saved locally.');
  let activeToken = token;
  const hadExistingToken = typeof token === 'string' && token.length > 0;
  try {
    if (!activeToken) {
      const account = await loginStudentRemotely(user.id, password, apiUrl, fetchImpl);
      if (account.role !== 'admin' || account.accessLevel === 'manager') {
        throw new Error('This account is not an event organizer. Pending attendance is still saved locally.');
      }
      activeToken = account.sessionToken;
    }
    try {
      const result = await syncToServer(data, user, activeToken, apiUrl, fetchImpl);
      return { ...result, sessionToken: activeToken };
    } catch (error) {
      if (error.status !== 401 || !hadExistingToken) throw error;
      const account = await loginStudentRemotely(user.id, password, apiUrl, fetchImpl);
      if (account.role !== 'admin' || account.accessLevel === 'manager') {
        throw new Error('This account is not an event organizer. Pending attendance is still saved locally.');
      }
      const result = await syncToServer(data, user, account.sessionToken, apiUrl, fetchImpl);
      return { ...result, sessionToken: account.sessionToken };
    }
  } catch (error) {
    if (/Pending attendance is still saved locally\./.test(error.message)) throw error;
    throw new Error(`${error.message} Pending attendance is still saved locally. Check your connection or sign in online with the current password, then retry.`);
  }
}

export function markSynced(data, acceptedRecordIds) {
  const accepted = new Set(acceptedRecordIds);
  return { ...data, records: data.records.map(record => accepted.has(record.id) ? { ...record, synced: true } : record) };
}
