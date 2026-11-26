import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { Status, Table } from './ui.jsx';
import { StudentCombobox } from './StudentCombobox.jsx';

export function OrganizersPage({ token, overview, refresh, notify }) {
  const [studentId, setStudentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useMemo(() => (overview?.organizers || []).filter(organizer =>
    organizer.enabled && organizer.access_level === 'organizer'), [overview]);
  const available = useMemo(() => (overview?.students || [])
    .filter(student => !active.some(organizer => organizer.id === student.id))
    .sort((left, right) => `${left.section} ${left.name}`.localeCompare(`${right.section} ${right.name}`)), [overview, active]);
  const selectedId = available.some(student => student.id === studentId) ? studentId : '';

  async function grant() {
    if (!selectedId || busy) return;
    setBusy(true);
    setError('');
    try {
      await api('/management/organizers', { token, method: 'POST', body: { studentId: selectedId } });
      setStudentId('');
      await refresh();
      notify('Organizer access granted. Their student ID and current password remain the same.');
    } catch (grantError) {
      setError(grantError.message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(organizer) {
    if (busy) return;
    if (!window.confirm(`Revoke organizer access for ${organizer.name} (${organizer.id})? They will return to the student account with the same attendance history.`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/management/organizers/${encodeURIComponent(organizer.id)}`, {
        token,
        method: 'PATCH',
        body: { enabled: false },
      });
      await refresh();
      notify('Organizer access revoked. The account is now a student and can be granted access again.');
    } catch (revokeError) {
      setError(revokeError.message);
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel">
    <h1>Organizer access</h1>
    <p>Grant scanning access to a student from the imported roster. If the student is missing, import their section roster first, then search their ID here. Revoking access returns the account to the student list with the same attendance history.</p>
    <div className="grid">
      <div>
        <StudentCombobox
          label="Student"
          options={available}
          value={selectedId}
          onChange={setStudentId}
          disabled={busy}
          emptyText={available.length ? 'No matching students' : 'No unassigned students — import the section roster first'}
        />
      </div>
      <div className="toolbar align-end">
        <button type="button" onClick={grant} disabled={busy || !selectedId}>{busy ? 'Updating…' : 'Grant organizer access'}</button>
      </div>
    </div>
    <p className="muted">{active.length} active organizer{active.length === 1 ? '' : 's'}. Revoked accounts disappear from this list and return to the student picker.</p>
    <h2>Organizer accounts</h2>
    <Table headings={['Student ID', 'Name', 'Section', 'Events', 'Status', 'Action']} empty="No active organizers.">
      {active.map(organizer => <tr key={organizer.id}>
        <td>{organizer.id}</td>
        <td>{organizer.name}</td>
        <td>{organizer.section || '—'}</td>
        <td>{organizer.assigned_events ?? 0}</td>
        <td><span className="pill on">Active</span></td>
        <td><button type="button" className="danger" disabled={busy} onClick={() => revoke(organizer)}>Revoke</button></td>
      </tr>)}
    </Table>
    <Status message={error ? { text: error, error: true } : null} />
  </section>;
}
