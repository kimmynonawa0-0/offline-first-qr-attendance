async function postJson(apiUrl, path, body, fetchImpl) {
  if (!apiUrl) throw new Error('Set EXPO_PUBLIC_API_URL to the server address first.');
  let response;
  try {
    response = await fetchImpl(`${apiUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Could not reach the attendance server. Connect to the internet and try again.');
  }
  let result;
  try { result = await response.json(); } catch { throw new Error('Server returned an unreadable response.'); }
  if (!response.ok) throw new Error(result.error || 'Server request failed.');
  return result;
}

export async function uploadRosterToServer(students, user, password, apiUrl, fetchImpl = fetch) {
  if (user?.role !== 'admin') throw new Error('Log in as an organizer to upload a roster.');
  const result = await postJson(apiUrl, '/roster/upload', { adminId: user.id, password, students }, fetchImpl);
  if (!Number.isInteger(result.added) || !Number.isInteger(result.skipped)) throw new Error('Server did not confirm the roster upload.');
  return result;
}

export async function loginStudentRemotely(identifier, password, apiUrl, fetchImpl = fetch) {
  const result = await postJson(apiUrl, '/auth/login', { id: identifier.trim(), password }, fetchImpl);
  if (result.account?.role !== 'student' || !result.account.id) throw new Error('Server returned an invalid student account.');
  return result.account;
}

export async function changeStudentPasswordRemotely(user, currentPassword, newPassword, apiUrl, fetchImpl = fetch) {
  if (user?.role !== 'student') throw new Error('Log in as a student to change this password.');
  return postJson(apiUrl, '/auth/password', { id: user.id, currentPassword, newPassword }, fetchImpl);
}

export async function syncToServer(data, user, password, apiUrl, fetchImpl = fetch) {
  if (user?.role !== 'admin') throw new Error('Log in as an organizer to sync.');
  if (!apiUrl) throw new Error('Set EXPO_PUBLIC_API_URL to the server address first.');
  if (!password) throw new Error('Enter your server organizer password.');
  const pending = data.records.filter(record => !record.synced);
  const response = await fetchImpl(`${apiUrl.replace(/\/$/, '')}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      adminId: user.id,
      password,
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
