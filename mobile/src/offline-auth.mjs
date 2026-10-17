import { sessionFor } from './model.mjs';

export const ACTIVE_USER_KEY = 'norwescan-active-user';
const CREDENTIALS_KEY = 'norwescan-offline-credentials';

async function readCredentials(secureStore) {
  const saved = await secureStore.getItemAsync(CREDENTIALS_KEY);
  if (!saved) return {};
  try {
    const credentials = JSON.parse(saved);
    return credentials && typeof credentials === 'object' && !Array.isArray(credentials) ? credentials : {};
  } catch { return {}; }
}

const accountKey = (role, id) => `${role}:${id}`;

export async function saveOfflineCredential(secureStore, role, id, password) {
  if (!['admin', 'student'].includes(role) || !id || typeof password !== 'string') {
    throw new Error('Could not protect this account for offline sign-in.');
  }
  const credentials = await readCredentials(secureStore);
  credentials[accountKey(role, id)] = password;
  await secureStore.setItemAsync(CREDENTIALS_KEY, JSON.stringify(credentials));
}

export async function getOfflineCredential(secureStore, role, id) {
  if (!['admin', 'student'].includes(role) || !id) return null;
  const credentials = await readCredentials(secureStore);
  return typeof credentials[accountKey(role, id)] === 'string' ? credentials[accountKey(role, id)] : null;
}

export function activeUserMarker(user) {
  if (!user || !['admin', 'student'].includes(user.role) || !user.id) return null;
  return { id: user.id, role: user.role };
}

export async function persistActiveUser(secureStore, user) {
  const marker = activeUserMarker(user);
  if (marker) await secureStore.setItemAsync(ACTIVE_USER_KEY, JSON.stringify(marker));
  else await secureStore.deleteItemAsync(ACTIVE_USER_KEY);
}

export function restoreRememberedUser(data, marker) {
  if (!marker || !['admin', 'student'].includes(marker.role) || typeof marker.id !== 'string') return null;
  const key = marker.role === 'admin' ? 'admins' : 'students';
  const otherKey = marker.role === 'admin' ? 'students' : 'admins';
  const account = data[key].find(item => item.id === marker.id);
  if (!account || data[otherKey].some(item => item.id === marker.id)) return null;
  return sessionFor(account, marker.role);
}

export async function authenticateOffline(data, identifier, password, secureStore) {
  const id = identifier.trim();
  const admin = data.admins.some(account => account.id === id);
  const student = data.students.some(account => account.id === id);
  if (!id || admin === student) {
    throw new Error('Invalid student ID or password. Connect and sign in online if this account has not been used on this device before.');
  }
  const role = admin ? 'admin' : 'student';
  const cachedPassword = await getOfflineCredential(secureStore, role, id);
  if (cachedPassword === null) {
    throw new Error('This account has not signed in online on this device yet. Connect to the internet and sign in once to enable offline access.');
  }
  if (cachedPassword !== password) throw new Error('Invalid student ID or password.');
  const account = data[role === 'admin' ? 'admins' : 'students'].find(item => item.id === id);
  return sessionFor(account, role);
}
