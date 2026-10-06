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
