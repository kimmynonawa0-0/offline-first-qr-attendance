import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { PasswordDialog, Status, Table } from './ui.jsx';

function escapeText(value) {
  return String(value ?? '');
}

export function EventTable({ events, onDelete, showActions = false }) {
  const headings = ['Event', 'Date / Time', 'Location', 'Organizers', 'Check-ins'];
  if (showActions) headings.push('Action');
  return <Table headings={headings} empty="No events found.">
    {events.map(event => <tr key={event.id}>
      <td>{escapeText(event.name)}</td>
      <td>{escapeText(event.date)} {escapeText(event.time)}{event.end ? ` – ${escapeText(event.end)}` : ''}</td>
      <td>{escapeText(event.location)}</td>
      <td>{(event.organizers || []).map(organizer => organizer.name).join(', ') || '—'}</td>
      <td>{event.attendance_count ?? 0}</td>
      {showActions && <td><button type="button" className="danger" onClick={() => onDelete?.(event)}>{Number(event.attendance_count) > 0 ? 'Force delete' : 'Delete'}</button></td>}
    </tr>)}
  </Table>;
}

function suggestedEnd(start) {
  if (!start) return '';
  const [hours, minutes] = start.split(':').map(Number);
  const total = Math.min(hours * 60 + minutes + 60, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function EventsPage({ token, overview, refresh, notify }) {
  const [draft, setDraft] = useState({ name: '', location: '', date: '', time: '', end: '' });
  const [organizerIds, setOrganizerIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const activeOrganizers = useMemo(() => (overview?.organizers || []).filter(organizer =>
    organizer.enabled && organizer.access_level === 'organizer'), [overview]);

  function setField(field, value) {
    setDraft(current => ({
      ...current,
      [field]: value,
      ...(field === 'time' && (!current.end || current.end <= value) ? { end: suggestedEnd(value) } : {}),
    }));
  }

  function toggleOrganizer(id, checked) {
    setOrganizerIds(current => checked ? [...new Set([...current, id])] : current.filter(item => item !== id));
  }

  async function create(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrors(null);
    try {
      if (!draft.name.trim() || !draft.location.trim() || !draft.date || !draft.time || !draft.end || organizerIds.length === 0) {
        throw new Error('Complete event details and select at least one organizer.');
      }
      if (draft.end <= draft.time) throw new Error('End time must be later than the start time.');
      await api('/management/events', {
        token,
        method: 'POST',
        body: {
          event: {
            id: globalThis.crypto?.randomUUID?.() || `event-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            name: draft.name.trim(),
            location: draft.location.trim(),
            date: draft.date,
            time: draft.time,
            end: draft.end,
          },
          organizerIds,
        },
      });
      setDraft({ name: '', location: '', date: '', time: '', end: '' });
      setOrganizerIds([]);
      await refresh();
      notify('Event created and assigned. Organizers can download it when they sign in online.');
    } catch (error) {
      setErrors(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(password) {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const result = await api(`/management/events/${encodeURIComponent(deleteTarget.id)}`, {
        token,
        method: 'DELETE',
        body: { password },
      });
      setDeleteTarget(null);
      await refresh();
      notify(result.deletedAttendance
        ? `Event deleted with ${result.deletedAttendance} attendance record${result.deletedAttendance === 1 ? '' : 's'}.`
        : 'Event deleted.');
    } catch (error) {
      setErrors(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <>
    <section className="panel">
      <h1>Create and assign an event</h1>
      <p>Assigned organizers download this event and the student roster when they sign in online. They can then scan while offline and sync afterward.</p>
      <form onSubmit={create}>
        <div className="grid">
          <div><label htmlFor="event-name">Event name</label><input id="event-name" maxLength={200} value={draft.name} onChange={event => setField('name', event.target.value)} required /></div>
          <div><label htmlFor="event-location">Location</label><input id="event-location" maxLength={200} value={draft.location} onChange={event => setField('location', event.target.value)} required /></div>
          <div><label htmlFor="event-date">Date</label><input id="event-date" type="date" value={draft.date} onChange={event => setField('date', event.target.value)} required /></div>
          <div><label htmlFor="event-time">Start time</label><input id="event-time" type="time" value={draft.time} onChange={event => setField('time', event.target.value)} required /></div>
          <div><label htmlFor="event-end">End time</label><input id="event-end" type="time" value={draft.end} onChange={event => setField('end', event.target.value)} required /></div>
        </div>
        <label>Assign active organizers</label>
        <div className="picklist">
          {activeOrganizers.length ? activeOrganizers.map(organizer => <label className="check" key={organizer.id}>
            <input type="checkbox" checked={organizerIds.includes(organizer.id)} onChange={event => toggleOrganizer(organizer.id, event.target.checked)} />
            {organizer.name} — {organizer.id}
          </label>) : <p className="muted">Grant organizer access before assigning an event.</p>}
        </div>
        <div className="toolbar"><button type="submit" disabled={busy || !activeOrganizers.length}>{busy ? 'Creating…' : 'Create event'}</button></div>
        <Status message={errors ? { text: errors, error: true } : null} />
      </form>
    </section>
    <section className="panel">
      <h2>Events</h2>
      <EventTable events={overview?.events || []} showActions onDelete={target => { setErrors(null); setDeleteTarget(target); }} />
    </section>
    {deleteTarget && <PasswordDialog
      title={`Delete ${deleteTarget.name}?`}
      message={Number(deleteTarget.attendance_count) > 0
        ? `This event already has ${deleteTarget.attendance_count} synced check-in${Number(deleteTarget.attendance_count) === 1 ? '' : 's'}. Force deletion permanently deletes the event and those attendance records. Unsynced scans on offline devices will fail to upload. This cannot be undone.`
        : 'This event has no synced check-ins. Deleting it cannot be undone.'}
      confirmLabel={Number(deleteTarget.attendance_count) > 0 ? 'Force delete' : 'Delete event'}
      danger
      busy={busy}
      onConfirm={confirmDelete}
      onCancel={() => setDeleteTarget(null)}
      error={errors || ''}
    />}
  </>;
}
