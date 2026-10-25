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
  const saved = session?.id && typeof session.token === 'string' && session.token
    ? JSON.stringify({ id: session.id, token: session.token })
    : null;
  await storage.setItem(WEB_ORGANIZER_SESSION_KEY, saved);
}

export function restoreWebOrganizerSession(saved, user) {
  if (user?.role !== 'admin' || typeof saved !== 'string') return null;
  try {
    const session = JSON.parse(saved);
    return session?.id === user.id && typeof session.token === 'string' && session.token
      ? { id: session.id, token: session.token }
      : null;
  } catch {
    return null;
  }
}
