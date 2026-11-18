import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Status, Table } from './ui.jsx';

export function AttendancePage({ token }) {
  const [records, setRecords] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      const result = await api('/management/attendance', { token });
      setRecords(result.records || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  return <section className="panel">
    <h1>Attendance records</h1>
    <p>Every synced check-in across all events.</p>
    <div className="toolbar">
      <button type="button" className="secondary" disabled={busy} onClick={load}>{busy ? 'Refreshing…' : 'Refresh records'}</button>
      {records && <span className="muted">{records.length} record{records.length === 1 ? '' : 's'}</span>}
    </div>
    <Status message={error ? { text: error, error: true } : null} />
    {records ? <Table headings={['Student ID', 'Student', 'Event', 'Location', 'Time In', 'Time Out']} empty="No attendance records yet.">
      {records.map(record => <tr key={record.id}>
        <td>{record.student_id}</td>
        <td>{record.student_name}</td>
        <td>{record.event_name}</td>
        <td>{record.location || '—'}</td>
        <td>{record.time_in_at || record.recorded_at} / {record.time_in_method || record.method}</td>
        <td>{record.time_out_at ? `${record.time_out_at}${record.time_out_method ? ` / ${record.time_out_method}` : ''}` : '—'}</td>
      </tr>)}
    </Table> : <p className="muted">Loading attendance…</p>}
  </section>;
}
