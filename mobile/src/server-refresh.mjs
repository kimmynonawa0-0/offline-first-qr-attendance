const STUDENT_REFRESH_SCREENS = new Set(['student-home', 'records']);

export function serverRefreshScope(screen, role) {
  if (role === 'student' && STUDENT_REFRESH_SCREENS.has(screen)) return 'student-attendance';
  return null;
}
