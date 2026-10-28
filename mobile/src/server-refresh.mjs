const STUDENT_REFRESH_SCREENS = new Set(['student-home', 'records']);
const ORGANIZER_REFRESH_SCREENS = new Set(['admin-home', 'admin-records', 'history', 'event', 'scanner']);

export function serverRefreshScope(screen, role) {
  if (role === 'student' && STUDENT_REFRESH_SCREENS.has(screen)) return 'student-attendance';
  if (role === 'admin' && ORGANIZER_REFRESH_SCREENS.has(screen)) return 'organizer-bootstrap';
  return null;
}
