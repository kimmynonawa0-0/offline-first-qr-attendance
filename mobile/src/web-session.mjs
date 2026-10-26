import { ACTIVE_USER_KEY, activeUserMarker, restoreRememberedUser } from './offline-auth.mjs';

export const WEB_ORGANIZER_SESSION_KEY = 'norwescan-admin-session';

export async function persistWebSession(storage, account) {
  const marker = activeUserMarker(account);
  await storage.setItem(ACTIVE_USER_KEY, marker ? JSON.stringify(marker) : null);
}

export function restoreWebSession(data, saved) {
  if (typeof saved !== 'string') return null;

  try {
    return restoreRememberedUser(data, JSON.parse(saved));
  } catch {
    return null;
  }
}

export async function persistWebOrganizerSession(storage, session) {
  const role = session?.role || 'admin';
  const saved = session?.id && ['admin', 'student'].includes(role)
    && typeof session.token === 'string' && session.token
    ? JSON.stringify({ id: session.id, role, token: session.token })
    : null;
  await storage.setItem(WEB_ORGANIZER_SESSION_KEY, saved);
}

export function restoreWebOrganizerSession(saved, user) {
  if (!['admin', 'student'].includes(user?.role) || typeof saved !== 'string') return null;
  try {
    const session = JSON.parse(saved);
    const role = session?.role || (user.role === 'admin' ? 'admin' : null);
    return session?.id === user.id && role === user.role && typeof session.token === 'string' && session.token
      ? { id: session.id, role: user.role, token: session.token }
      : null;
  } catch {
    return null;
  }
}
