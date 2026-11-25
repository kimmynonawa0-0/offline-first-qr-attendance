import test from 'node:test';
import assert from 'node:assert/strict';
import { sectionInfo } from '../manager/section-info.mjs';
import { searchStudents, STUDENT_SEARCH_LIMIT } from '../manager/student-search.mjs';

test('manager student filters derive program and year from section names', () => {
  assert.deepEqual(sectionInfo('BSCS-3C'), { program: 'BSCS', year: '3' });
  assert.deepEqual(sectionInfo('BSIT 2A'), { program: 'BSIT', year: '2' });
  assert.deepEqual(sectionInfo(''), { program: 'Other', year: 'Other' });
  assert.deepEqual(sectionInfo('Special Section'), { program: 'Other', year: 'Other' });
});

test('organizer picker search filters students by ID, name, or section', () => {
  const students = [
    { id: '23-00001', name: 'Miko Doinog', section: 'BSCS-3C' },
    { id: '23-00002', name: 'Ally Reyes', section: 'BSIT-2A' },
    { id: '23-00003', name: 'Miko Santos', section: 'BSCS-3B' },
  ];
  assert.deepEqual(searchStudents(students, 'miko').matches.map(student => student.id), ['23-00001', '23-00003']);
  assert.deepEqual(searchStudents(students, 'bsit').matches.map(student => student.id), ['23-00002']);
  assert.deepEqual(searchStudents(students, '23-00002').matches.map(student => student.id), ['23-00002']);
  assert.deepEqual(searchStudents(students, '').matches.map(student => student.id), ['23-00001', '23-00002', '23-00003']);
});

test('organizer picker search caps the visible matches', () => {
  const students = Array.from({ length: STUDENT_SEARCH_LIMIT + 5 }, (_, index) => ({
    id: `23-${String(index).padStart(5, '0')}`, name: `Student ${index}`, section: 'BSCS-3C',
  }));
  const result = searchStudents(students, 'student');
  assert.equal(result.matches.length, STUDENT_SEARCH_LIMIT);
  assert.equal(result.total, STUDENT_SEARCH_LIMIT + 5);
});
