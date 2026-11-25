export function validateManagedOrganizer(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Organizer details must be provided.');
  }

  const organizer = {
    id: typeof input.id === 'string' ? input.id.trim() : '',
    name: typeof input.name === 'string' ? input.name.trim() : '',
    section: typeof input.section === 'string' ? input.section.trim() : '',
    temporaryPassword: typeof input.temporaryPassword === 'string' ? input.temporaryPassword : '',
  };

  if (!organizer.id || !organizer.name || !organizer.section) {
    throw new Error('Student ID, full name, and section are required.');
  }
  if (organizer.id.length > 100 || organizer.name.length > 200 || organizer.section.length > 100) {
    throw new Error('Student ID, name, or section is too long.');
  }
  if (/[\r\n\t]/.test(organizer.id + organizer.name + organizer.section + organizer.temporaryPassword)) {
    throw new Error('Organizer fields cannot contain line breaks or tabs.');
  }
  // The temporary password is only used when the ID is not already a student in
  // the roster, so it may be blank here; the route re-checks it when it matters.
  if (organizer.temporaryPassword && organizer.temporaryPassword.length < 12) {
    throw new Error('Use at least 12 characters for the temporary password.');
  }
  if (organizer.temporaryPassword && organizer.temporaryPassword.toLowerCase() === organizer.section.toLowerCase()) {
    throw new Error('The temporary password cannot be the section name.');
  }
  return organizer;
}
