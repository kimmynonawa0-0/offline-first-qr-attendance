import { useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { Status, Table } from './ui.jsx';

const MAX_ROSTER_BYTES = 1024 * 1024;

function base64From(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export function RosterPage({ token, overview, refresh, notify }) {
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const knownIds = useMemo(() => new Set((overview?.students || []).map(student => student.id)), [overview]);
  const added = preview ? preview.rows.filter(row => !knownIds.has(row.id)).length : 0;

  async function review(event) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('Choose a roster file first.');
      return;
    }
    setBusy(true);
    setError('');
    setPreview(null);
    try {
      if (file.size > MAX_ROSTER_BYTES) throw new Error('Roster file must be no larger than 1 MB.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await api('/roster/preview', {
        token,
        method: 'POST',
        body: { fileName: file.name, fileBase64: base64From(bytes) },
      });
      setPreview({ name: file.name, rows: result.students || [] });
      notify('File validated. Confirm to import it into the shared database.');
    } catch (reviewError) {
      setError(reviewError.message);
    } finally {
      setBusy(false);
    }
  }

  async function upload() {
    if (!preview?.rows?.length || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api('/roster/upload', {
        token,
        method: 'POST',
        body: { students: preview.rows },
      });
      setPreview(null);
      if (fileRef.current) fileRef.current.value = '';
      await refresh();
      notify(`Imported. ${result.added} new students added; ${result.skipped} existing accounts kept.`);
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel">
    <h1>Import student roster</h1>
    <p>Choose a CSV or Excel file. Required columns: student_id, name, section. Email is optional. Student IDs must be formatted as text in Excel.</p>
    <form onSubmit={review}>
      <label htmlFor="roster-file">Roster file, up to 1 MB</label>
      <input id="roster-file" ref={fileRef} type="file" accept=".csv,.xlsx,.xls" disabled={busy} />
      <div className="toolbar">
        <button type="submit" disabled={busy}>{busy ? 'Reading…' : 'Review file'}</button>
        {preview?.rows?.length > 0 && <button type="button" className="secondary" disabled={busy} onClick={upload}>{busy ? 'Uploading…' : 'Confirm import'}</button>}
      </div>
    </form>
    <Status message={error ? { text: error, error: true } : null} />
    {preview && <div className="panel inset">
      <h2>Review {preview.rows.length} students</h2>
      <p>{added} new — {preview.rows.length - added} already in the server roster</p>
      <Table headings={['Student ID', 'Name', 'Section']}>
        {preview.rows.slice(0, 8).map(row => <tr key={row.id}>
          <td>{row.id}</td>
          <td>{row.name}</td>
          <td>{row.section}</td>
        </tr>)}
      </Table>
      {preview.rows.length > 8 && <p className="muted">Showing the first 8 entries.</p>}
    </div>}
  </section>;
}
