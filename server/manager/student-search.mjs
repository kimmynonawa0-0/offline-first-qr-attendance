export const STUDENT_SEARCH_LIMIT = 20;

export function searchStudents(students, query) {
  const term = query.trim().toLowerCase();
  const filtered = term
    ? students.filter(student => `${student.id} ${student.name} ${student.section}`.toLowerCase().includes(term))
    : students;
  return { matches: filtered.slice(0, STUDENT_SEARCH_LIMIT), total: filtered.length };
}
