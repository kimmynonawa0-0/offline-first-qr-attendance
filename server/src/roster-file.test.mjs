import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from '@e965/xlsx';
import { parseRosterFile } from './roster-file.mjs';

test('server roster preview parses CSV and preserves text student IDs', () => {
  const csv = Buffer.from('student_id,name,section\n"00123",Juan,BSCS-3C', 'utf8').toString('base64');
  assert.deepEqual(parseRosterFile('faculty.csv', csv), [
    { id: '00123', name: 'Juan', section: 'BSCS-3C', email: '' },
  ]);
});

test('server roster preview parses the first Excel worksheet and rejects numeric IDs', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Student ID', 'Full Name', 'Section'], ['00123', 'Juan', 'BSCS-3C'],
  ]), 'Roster');
  const base64 = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }).toString('base64');
  assert.equal(parseRosterFile('faculty.xlsx', base64)[0].id, '00123');
  const numeric = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(numeric, XLSX.utils.aoa_to_sheet([
    ['student_id', 'name', 'section'], [123, 'Juan', 'BSCS-3C'],
  ]), 'Roster');
  const numericBase64 = XLSX.write(numeric, { type: 'buffer', bookType: 'xlsx' }).toString('base64');
  assert.throws(() => parseRosterFile('faculty.xlsx', numericBase64), /format Student ID cells as text/);
});

test('server roster preview rejects password columns and files above its size limit', () => {
  const csv = Buffer.from('student_id,name,section,password\n1,Juan,S,nope', 'utf8').toString('base64');
  assert.throws(() => parseRosterFile('faculty.csv', csv), /Do not include roles or passwords/);
  assert.throws(() => parseRosterFile('faculty.csv', 'A'.repeat(1_400_000)), /no larger than 1 MB/);
});
