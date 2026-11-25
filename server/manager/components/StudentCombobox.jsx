import { useId, useMemo, useRef, useState } from 'react';
import { searchStudents } from '../student-search.mjs';

export function StudentCombobox({ label = 'Student', options, value, onChange, disabled = false, placeholder = 'Search by ID, name, or section', emptyText = 'No students match' }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef(null);
  const inputId = useId();
  const listId = useId();
  const { matches, total } = useMemo(() => searchStudents(options, query), [options, query]);
  const selected = options.find(student => student.id === value);

  function pick(student) {
    onChange(student.id);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setHighlight(index => Math.min(index + 1, matches.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight(index => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && open && matches[highlight]) {
      event.preventDefault();
      pick(matches[highlight]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  const display = open ? query : (selected ? `${selected.id} — ${selected.name} (${selected.section})` : '');

  return <>
    <label htmlFor={inputId}>{label}</label>
    <div className="combobox">
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={display}
        onChange={event => { setQuery(event.target.value); setOpen(true); setHighlight(0); }}
        onFocus={() => { setOpen(true); setHighlight(0); }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {open && <ul id={listId} role="listbox" className="picklist combobox-list">
        {matches.length ? matches.map((student, index) => <li
          key={student.id}
          role="option"
          aria-selected={student.id === value}
          className={`combobox-option${index === highlight ? ' highlighted' : ''}`}
          onMouseDown={event => { event.preventDefault(); pick(student); }}
          onMouseEnter={() => setHighlight(index)}
        >{student.id} — {student.name} ({student.section})</li>) : <li className="combobox-count">{emptyText}</li>}
        {total > matches.length && <li className="combobox-count">{matches.length} of {total} matches — keep typing to narrow</li>}
      </ul>}
    </div>
  </>;
}
