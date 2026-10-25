export function validateManagedStudent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Student details must be provided.');
  }

  const student = {
    id: typeof input.id === 'string' ? input.id.trim() : '',
    name: typeof input.name === 'string' ? input.name.trim() : '',
    section: typeof input.section === 'string' ? input.section.trim() : '',
    email: typeof input.email === 'string' ? input.email.trim().toLowerCase() : '',
  };

  if (!student.id || !student.name || !student.section) {
    throw new Error('Student ID, full name, and section are required.');
  }
  if (student.id.length > 100 || student.name.length > 200 || student.section.length > 100) {
    throw new Error('Student ID, name, or section is too long.');
  }
  if (/[\r\n\t]/.test(student.id + student.name + student.section)) {
    throw new Error('Student fields cannot contain line breaks or tabs.');
  }
  if (student.email && (student.email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(student.email))) {
    throw new Error('Enter a valid email address.');
  }
  return student;
}
