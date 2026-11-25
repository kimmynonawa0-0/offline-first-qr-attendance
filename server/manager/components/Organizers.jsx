import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { PasswordField, Status, Table } from './ui.jsx';
import { StudentCombobox } from './StudentCombobox.jsx';

const emptyDirect = { open: false, id: '', name: '', section: '', temporaryPassword: '' };

export function OrganizersPage({ token, overview, refresh, notify }) {
  const [studentId, setStudentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [direct, setDirect] = useState(emptyDirect);
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

  async function createDirect(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api('/management/organizers', {
        token,
        method: 'POST',
        body: { organizer: { id: direct.id, name: direct.name, section: direct.section, temporaryPassword: direct.temporaryPassword } },
      });
      setDirect(emptyDirect);
      await refresh();
      notify(result.note || 'Organizer account created. They sign in with their student ID and must change the temporary password at first sign-in.');
    } catch (createError) {
      setError(createError.message);
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel">
    <h1>Organizer access</h1>
    <p>Grant scanning access to a student already in the roster — or add an organizer account for someone who has not been imported yet. Revoking access returns the account to the student list with the same attendance history.</p>
    <div className="grid">
      <div>
        <StudentCombobox
          label="Student"
          options={available}
          value={selectedId}
          onChange={setStudentId}
          disabled={busy}
          emptyText={available.length ? 'No matching students' : 'No unassigned students'}
        />
      </div>
      <div className="toolbar align-end">
        <button type="button" onClick={grant} disabled={busy || !selectedId}>{busy ? 'Updating…' : 'Grant organizer access'}</button>
      </div>
    </div>
    <div className="toolbar">
      <button type="button" className="secondary" disabled={busy} onClick={() => setDirect(current => ({ ...current, open: true }))}>Add an organizer not in the roster</button>
      <span className="muted">{active.length} active organizer{active.length === 1 ? '' : 's'}. Revoked accounts disappear from this list and return to the student picker.</span>
    </div>
    {direct.open && <div className="panel inset">
      <h2>Add organizer account</h2>
      <p className="muted">For faculty or staff without a student record. They sign in with this ID. The temporary password (at least 12 characters, not the section) is needed only when the ID is not already in the roster.</p>
      <form onSubmit={createDirect}>
        <div className="grid">
          <div><label htmlFor="direct-organizer-id">Student ID</label><input id="direct-organizer-id" maxLength={100} value={direct.id} onChange={event => setDirect(current => ({ ...current, id: event.target.value }))} required /></div>
          <div><label htmlFor="direct-organizer-name">Full name</label><input id="direct-organizer-name" maxLength={200} value={direct.name} onChange={event => setDirect(current => ({ ...current, name: event.target.value }))} required /></div>
          <div><label htmlFor="direct-organizer-section">Section</label><input id="direct-organizer-section" maxLength={100} placeholder="BSCS-3C" value={direct.section} onChange={event => setDirect(current => ({ ...current, section: event.target.value }))} required /></div>
          <div><PasswordField label="Temporary password" id="direct-organizer-password" value={direct.temporaryPassword} onChange={temporaryPassword => setDirect(current => ({ ...current, temporaryPassword }))} autoComplete="new-password" minLength={12} required={false} /></div>
        </div>
        <div className="toolbar">
          <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create organizer account'}</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => setDirect(emptyDirect)}>Cancel</button>
        </div>
      </form>
    </div>}
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
