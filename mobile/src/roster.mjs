import { requireAdmin } from './model.mjs';

export const MAX_ROSTER_BYTES = 1024 * 1024;
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };

// Support Excel's quoted commas, escaped quotes, and CRLF without coercing IDs.
function csvRows(text) {
  const rows = [];
  let row = [], value = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else value += char;
    } else if (char === ',' || char === '\n' || char === '\r') {
      row.push(value.trim()); value = ''; closed = false;
      if (char !== ',') {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (char === '\r' && text[i + 1] === '\n') i++;
      }
    } else if (char === '"') {
      requireValue(!value.trim() && !closed, 'Malformed CSV quotes. Export the spreadsheet as CSV UTF-8 again.');
      value = ''; quoted = true;
    } else {
      requireValue(!closed || /\s/.test(char), 'Unexpected text after a quoted CSV value.');
      if (!closed) value += char;
    }
  }
  requireValue(!quoted, 'Unclosed CSV quote. Check the faculty file.');
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function validateRoster(rows) {
  requireValue(Array.isArray(rows) && rows.length > 0 && rows.length <= 5000, 'Import between 1 and 5,000 students at a time.');
  const ids = new Set();
  return rows.map((row, i) => {
    const id = String(row.id || '').trim();
    const name = String(row.name || '').trim();
    const section = String(row.section || '').trim();
    const email = String(row.email || '').trim().toLowerCase();
    requireValue(id && name && section, `Row ${i + 2}: student ID, name, and section are required.`);
    requireValue(id.length <= 100 && name.length <= 200 && section.length <= 100, `Row ${i + 2}: a field is too long.`);
    requireValue(!/[\r\n\t]/.test(id + name + section), `Row ${i + 2}: fields cannot contain line breaks or tabs.`);
    requireValue(!email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), `Row ${i + 2}: invalid email.`);
    requireValue(!ids.has(id), `Row ${i + 2}: duplicate student ID ${id}. No students were imported.`);
    ids.add(id);
    return { id, name, section, email };
  });
}

export function parseRoster(text) {
  requireValue(typeof text === 'string' && text.length <= MAX_ROSTER_BYTES, 'CSV must be no larger than 1 MB.');
  const rows = csvRows(text.replace(/^\uFEFF/, ''));
  requireValue(rows.length > 1, 'CSV needs a header and at least one student.');
  const aliases = { id: 'id', studentid: 'id', name: 'name', fullname: 'name', section: 'section', email: 'email' };
  const headers = rows[0].map(h => h.toLowerCase().replace(/[ _-]/g, ''));
  requireValue(!headers.some(h => ['role', 'admin', 'isadmin', 'password'].includes(h)), 'Do not include roles or passwords. This file creates students only.');
  const keys = headers.map(h => aliases[h] || null);
  for (const key of ['id', 'name', 'section']) requireValue(keys.filter(k => k === key).length === 1, `CSV needs exactly one ${key} column.`);
  requireValue(keys.filter(k => k === 'email').length <= 1, 'CSV has duplicate email columns.');
  return validateRoster(rows.slice(1).map((cells, i) => {
    requireValue(cells.length === headers.length, `Row ${i + 2}: column count does not match the header.`);
    return Object.fromEntries(keys.flatMap((key, j) => key ? [[key, cells[j]]] : []));
  }));
}

export function rosterSummary(data, rows) {
  const ids = new Set([...data.students, ...data.admins].map(a => a.id));
  const added = rows.filter(row => !ids.has(row.id)).length;
  return { added, skipped: rows.length - added };
}

export function importRoster(data, user, rows) {
  requireAdmin(data, user);
  const valid = validateRoster(rows);
  const ids = new Set([...data.students, ...data.admins].map(a => a.id));
  const students = valid.filter(row => !ids.has(row.id)).map(row => ({ ...row, password: row.section, mustChangePassword: true }));
  return { ...data, students: [...data.students, ...students] };
}
