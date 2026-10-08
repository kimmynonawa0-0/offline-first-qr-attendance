async function postJson(apiUrl, path, body, fetchImpl, token) {
  if (!apiUrl) throw new Error('Set EXPO_PUBLIC_API_URL to the server address first.');
  let response;
  try {
    response = await fetchImpl(`${apiUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Could not reach the attendance server. Connect to the internet and try again.');
  }
  let result;
  try { result = await response.json(); } catch { throw new Error('Server returned an unreadable response.'); }
  if (!response.ok) throw new Error(result.error || 'Server request failed.');
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
  const result = await postJson(apiUrl, '/auth/login', { id: identifier.trim(), password }, fetchImpl, previousToken);
  if (!['student', 'admin'].includes(result.account?.role) || !result.account.id) throw new Error('Server returned an invalid account.');
  if (result.account.role === 'admin' && typeof result.sessionToken !== 'string') throw new Error('Server did not issue an organizer session.');
  if (result.account.role === 'admin') result.account.sessionToken = result.sessionToken;
  return result.account;
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

export async function syncToServer(data, user, token, apiUrl, fetchImpl = fetch) {
  if (user?.role !== 'admin') throw new Error('Log in as an organizer to sync.');
  if (!apiUrl) throw new Error('Set EXPO_PUBLIC_API_URL to the server address first.');
  if (!token) throw new Error('Sign in online as an organizer to sync.');
  const pending = data.records.filter(record => !record.synced);
  const response = await fetchImpl(`${apiUrl.replace(/\/$/, '')}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      students: data.students.map(({ id, name, section, email }) => ({ id, name, section, email })),
      events: data.events.map(({ attendees, ...event }) => event),
      records: pending,
    }),
  });
  let result;
  try { result = await response.json(); } catch { throw new Error('Server returned an unreadable response.'); }
  if (!response.ok) throw new Error(result.error || 'Sync failed. Records are still saved locally.');
  if (!Array.isArray(result.acceptedRecordIds) || !Array.isArray(result.conflictRecordIds)) {
    throw new Error('Server did not confirm which records it saved.');
  }
  return result;
}

export function markSynced(data, acceptedRecordIds) {
  const accepted = new Set(acceptedRecordIds);
  return { ...data, records: data.records.map(record => accepted.has(record.id) ? { ...record, synced: true } : record) };
}
