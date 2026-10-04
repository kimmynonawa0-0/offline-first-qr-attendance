import * as XLSX from '@e965/xlsx';
import { MAX_ROSTER_BYTES, parseRosterTable } from './roster.mjs';

export function parseSpreadsheet(buffer) {
  if (!(buffer instanceof ArrayBuffer || ArrayBuffer.isView(buffer)) || buffer.byteLength > MAX_ROSTER_BYTES) {
    throw new Error('Roster file must be no larger than 1 MB.');
  }
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'array' });
  } catch {
    throw new Error('Could not read this Excel file. Select a valid .xlsx or .xls workbook.');
  }
  if (!workbook.SheetNames.length) throw new Error('Excel file has no worksheets.');
  const table = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
    header: 1, raw: true, defval: '', blankrows: false,
  });
  const width = table[0]?.length || 0;
  return parseRosterTable(table.map((row, i) => {
    if (row.length > width && row.slice(width).some(value => value !== '')) {
      throw new Error(`Row ${i + 1}: column count does not match the header.`);
    }
    return row.slice(0, width).concat(Array(Math.max(0, width - row.length)).fill(''));
  }));
}
