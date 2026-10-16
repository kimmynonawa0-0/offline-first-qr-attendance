import * as XLSX from '@e965/xlsx';
import { validateRoster } from './roster.mjs';

export const MAX_ROSTER_FILE_BYTES = 1024 * 1024;

function parseCsvRows(text) {
  const rows = [];
  let row = [], value = '', quoted = false, closed = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { value += '"'; index++; }
      else if (char === '"') { quoted = false; closed = true; }
      else value += char;
    } else if (char === ',' || char === '\n' || char === '\r') {
      row.push(value.trim()); value = ''; closed = false;
      if (char !== ',') {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (char === '\r' && text[index + 1] === '\n') index++;
      }
    } else if (char === '"') {
      if (value.trim() || closed) throw new Error('Malformed CSV quotes. Export the spreadsheet as CSV UTF-8 again.');
      value = ''; quoted = true;
    } else {
      if (closed && !/\s/.test(char)) throw new Error('Unexpected text after a quoted CSV value.');
      if (!closed) value += char;
    }
  }
  if (quoted) throw new Error('Unclosed CSV quote. Check the faculty file.');
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function parseRosterFile(fileName, base64) {
  if (typeof fileName !== 'string' || !/\.(csv|xlsx|xls)$/i.test(fileName)) {
    throw new Error('Choose a .csv, .xlsx, or .xls roster.');
  }
  if (typeof base64 !== 'string' || !base64 || base64.length > Math.ceil(MAX_ROSTER_FILE_BYTES * 4 / 3) + 8) {
    throw new Error('Roster file must be no larger than 1 MB.');
  }
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length || bytes.length > MAX_ROSTER_FILE_BYTES) throw new Error('Roster file must be no larger than 1 MB.');
  let rows;
  if (/\.csv$/i.test(fileName)) {
    try { rows = parseCsvRows(new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '')); }
    catch (error) {
      if (error instanceof TypeError) throw new Error('CSV must be saved as UTF-8.');
      throw error;
    }
  } else {
    let workbook;
    try { workbook = XLSX.read(bytes, { type: 'buffer', cellDates: false }); }
    catch { throw new Error('Could not read this file. Choose a valid CSV or Excel roster.'); }
    if (!workbook.SheetNames.length) throw new Error('The roster file has no worksheets.');
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '', blankrows: false });
  }
  if (rows.length < 2) throw new Error('File needs a header and at least one student.');
  const headers = rows[0].map(value => String(value ?? '').replace(/^\uFEFF/, '').toLowerCase().replace(/[ _-]/g, ''));
  const aliases = { id: 'id', studentid: 'id', name: 'name', fullname: 'name', section: 'section', email: 'email' };
  if (headers.some(header => ['role', 'admin', 'isadmin', 'password'].includes(header))) {
    throw new Error('Do not include roles or passwords. This file creates students only.');
  }
  const keys = headers.map(header => aliases[header] || null);
  for (const key of ['id', 'name', 'section']) {
    if (keys.filter(value => value === key).length !== 1) throw new Error(`File needs exactly one ${key} column.`);
  }
  if (keys.filter(value => value === 'email').length > 1) throw new Error('File has duplicate email columns.');
  const idColumn = keys.indexOf('id');
  const students = rows.slice(1).map((row, index) => {
    if (row.length !== headers.length) throw new Error(`Row ${index + 2}: column count does not match the header.`);
    if (typeof row[idColumn] !== 'string') throw new Error(`Row ${index + 2}: format Student ID cells as text in Excel to preserve leading zeros.`);
    return Object.fromEntries(keys.flatMap((key, column) => key ? [[key, row[column]]] : []));
  });
  return validateRoster(students);
}
