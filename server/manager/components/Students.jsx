import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { sectionInfo } from '../section-info.mjs';
import { PasswordDialog, Status, Table } from './ui.jsx';

const emptyEditor = { open: false, editingId: '', id: '', name: '', section: '', email: '' };

export function StudentsPage({ token, overview, refresh, notify }) {
  const [program, setProgram] = useState('');
  const [year, setYear] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [editor, setEditor] = useState(emptyEditor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sectionToDelete, setSectionToDelete] = useState(null);

  const students = overview?.students || [];
  const grouped = useMemo(() => students.map(student => ({ ...student, ...sectionInfo(student.section) })), [students]);
  const programs = useMemo(() => [...new Set(grouped.map(student => student.program))].sort(), [grouped]);
  const years = useMemo(() => [...new Set(grouped
    .filter(student => !program || student.program === program)
    .map(student => student.year))]
    .sort((left, right) => left === 'Other' ? 1 : right === 'Other' ? -1 : Number(left) - Number(right)), [grouped, program]);
  const visible = grouped.filter(student => (!program || student.program === program) && (!year || student.year === year));
  const sections = useMemo(() => {
    const map = new Map();
    for (const student of visible) {
      if (!map.has(student.section)) map.set(student.section, []);
      map.get(student.section).push(student);
    }
    return [...map.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [visible]);
  const selectedIds = [...selected].filter(id => students.some(student => student.id === id));

  function toggleSelected(id, checked) {
    setSelected(current => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function openEditor(student = null) {
    setEditor({
      open: true,
      editingId: student?.id || '',
      id: student?.id || '',
      name: student?.name || '',
      section: student?.section || '',
      email: student?.email || '',
    });
    setError('');
  }

  async function saveStudent(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const student = {
        id: editor.id.trim(),
        name: editor.name.trim(),
        section: editor.section.trim(),
        email: editor.email.trim(),
      };
      if (!student.id || !student.name || !student.section) throw new Error('Student ID, full name, and section are required.');
      const editing = Boolean(editor.editingId);
      await api(editing ? `/management/students/${encodeURIComponent(editor.editingId)}` : '/management/students', {
        token,
        method: editing ? 'PATCH' : 'POST',
        body: student,
      });
      setEditor(emptyEditor);
      await refresh();
      notify(editing ? 'Student profile updated.' : `Student added. Temporary password: ${student.section}`);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(student) {
    if (busy) return;
    if (!window.confirm(`Reset ${student.name}'s password to the temporary section password (${student.section})? They must change it after signing in.`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/management/students/${encodeURIComponent(student.id)}/password-reset`, { token, method: 'POST', body: {} });
      await refresh();
      notify(`Temporary password reset to ${student.section}. The student must change it after signing in.`);
    } catch (resetError) {
      setError(resetError.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteStudent(student) {
    if (busy) return;
    if (!window.confirm(`Delete ${student.name} (${student.id})? Their login and organizer access will be removed. Attendance history will be retained.`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/management/students/${encodeURIComponent(student.id)}`, { token, method: 'DELETE' });
      setSelected(current => {
        const next = new Set(current);
        next.delete(student.id);
        return next;
      });
      await refresh();
      notify('Student account deleted. Historical attendance was retained.');
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelected() {
    if (busy || !selectedIds.length) return;
    if (!window.confirm(`Delete ${selectedIds.length} selected student account${selectedIds.length === 1 ? '' : 's'}? Organizer access will be removed; attendance history will be retained.`)) return;
    setBusy(true);
    setError('');
    try {
      for (const id of selectedIds) await api(`/management/students/${encodeURIComponent(id)}`, { token, method: 'DELETE' });
      setSelected(new Set());
      await refresh();
      notify(`${selectedIds.length} student account${selectedIds.length === 1 ? '' : 's'} deleted. Historical attendance was retained.`);
    } catch (deleteError) {
      await refresh().catch(() => {});
      setError(deleteError.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteSection(password) {
    if (!sectionToDelete || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api(`/management/sections/${encodeURIComponent(sectionToDelete.section)}`, {
        token,
        method: 'DELETE',
        body: { password },
      });
      setSectionToDelete(null);
      setSelected(new Set());
      await refresh();
      notify(`Deleted ${result.deleted} student account${result.deleted === 1 ? '' : 's'} from ${sectionToDelete.section}. Historical attendance was retained.`);
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setBusy(false);
    }
  }

  return <>
    <section className="panel">
      <h1>Student accounts</h1>
      <p>Browse students by CCIS program, year, and section. New accounts and password resets use the section as a temporary password; the student must change it after signing in.</p>
      <div className="grid">
        <div>
          <label htmlFor="student-program">Program</label>
          <select id="student-program" value={program} onChange={event => { setProgram(event.target.value); setYear(''); }}>
            <option value="">All programs</option>
            {programs.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="student-year">Year level</label>
          <select id="student-year" value={year} onChange={event => setYear(event.target.value)}>
            <option value="">All years</option>
            {years.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
      </div>
      <div className="toolbar">
        <button type="button" onClick={() => openEditor()}>Add student</button>
        <button type="button" className="danger" disabled={busy || !selectedIds.length} onClick={deleteSelected}>Delete selected ({selectedIds.length})</button>
      </div>
      {editor.open && <div className="panel inset">
        <h2>{editor.editingId ? 'Edit student' : 'Add student'}</h2>
        <form onSubmit={saveStudent}>
          <div className="grid">
            <div><label htmlFor="student-id">Student ID</label><input id="student-id" maxLength={100} value={editor.id} disabled={Boolean(editor.editingId)} onChange={event => setEditor(current => ({ ...current, id: event.target.value }))} required /></div>
            <div><label htmlFor="student-name">Full name</label><input id="student-name" maxLength={200} value={editor.name} onChange={event => setEditor(current => ({ ...current, name: event.target.value }))} required /></div>
            <div><label htmlFor="student-section">Section</label><input id="student-section" maxLength={100} placeholder="BSCS-3C" value={editor.section} onChange={event => setEditor(current => ({ ...current, section: event.target.value }))} required /></div>
            <div><label htmlFor="student-email">Email</label><input id="student-email" type="email" maxLength={320} value={editor.email} onChange={event => setEditor(current => ({ ...current, email: event.target.value }))} /></div>
          </div>
          <p className="muted">Changing a student's section updates the temporary password only if they have not changed it yet.</p>
          <div className="toolbar">
            <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save student'}</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => setEditor(emptyEditor)}>Cancel</button>
          </div>
        </form>
      </div>}
      <Status message={error ? { text: error, error: true } : null} />
      <div className="student-sections">
        {sections.length ? sections.map(([section, rows]) => {
          const info = sectionInfo(section);
          const allSectionCount = students.filter(student => student.section === section).length;
          return <details className="section-group" key={section}>
            <summary>
              {info.program} / Year {info.year} / {section}
              <span className="muted">{allSectionCount} students</span>
            </summary>
            <div className="section-actions">
              <span className="muted">{rows.length} shown by current filters</span>
              <button type="button" className="danger" disabled={busy} onClick={() => { setError(''); setSectionToDelete({ section, count: allSectionCount }); }}>Delete entire section ({allSectionCount})</button>
            </div>
            <Table headings={['Student ID', 'Full name', 'Email', 'Actions']}>
              {rows.slice().sort((left, right) => left.id.localeCompare(right.id)).map(student => <tr key={student.id}>
                <td>
                  <label className="check inline-check">
                    <input type="checkbox" checked={selected.has(student.id)} onChange={event => toggleSelected(student.id, event.target.checked)} aria-label={`Select ${student.name}`} />
                    {student.id}
                  </label>
                </td>
                <td>{student.name}</td>
                <td>{student.email || '—'}</td>
                <td className="student-actions">
                  <button type="button" className="secondary" disabled={busy} onClick={() => openEditor(student)}>Edit</button>
                  <button type="button" className="secondary" disabled={busy} onClick={() => resetPassword(student)}>Reset password</button>
                  <button type="button" className="danger" disabled={busy} onClick={() => deleteStudent(student)}>Delete</button>
                </td>
              </tr>)}
            </Table>
          </details>;
        }) : <p className="muted">No students match these filters.</p>}
      </div>
    </section>
    {sectionToDelete && <PasswordDialog
      title={`Delete entire ${sectionToDelete.section} section?`}
      message={`Permanently delete all ${sectionToDelete.count} student account${sectionToDelete.count === 1 ? '' : 's'} in this section? Attendance history will be retained.`}
      confirmLabel="Delete section"
      danger
      busy={busy}
      error={error}
      onConfirm={deleteSection}
      onCancel={() => setSectionToDelete(null)}
    />}
  </>;
}
