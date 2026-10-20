import { ACTIVE_USER_KEY, activeUserMarker, restoreRememberedUser } from './offline-auth.mjs';

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
