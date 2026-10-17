import { createHash, randomBytes } from 'node:crypto';

export function createOrganizerSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function loginClientRoleError(client, accessLevel) {
  if (client === 'organizer-web' && accessLevel !== 'organizer') return 'System managers sign in at /manager.';
  if (client === 'manager-web' && accessLevel !== 'manager') return 'This account does not have system-manager access.';
  if (client === 'mobile' && accessLevel === 'manager') return 'System manager accounts use the management website, not the scanning app.';
  return null;
}

export function canImportRoster(account) {
  if (!account || account.must_change_password) return false;
  return account.access_level === 'manager'
    || (account.access_level === 'organizer' && Boolean(account.section));
}

export function rosterScopeError(account, students) {
  if (account?.access_level !== 'organizer') return null;
  if (!account.section) return 'Your organizer account is not linked to a roster section. Contact the system manager.';
  if (Array.isArray(students) && students.some(student => student?.section?.trim?.() !== account.section)) {
    return `You can only import students from your section (${account.section}).`;
  }
  return null;
}

export function canCreateOrganizerEvent(account) {
  return account?.access_level === 'organizer' && !account.must_change_password;
}

export function organizerEventAssigneeIds(account, requestedIds) {
  if (!canCreateOrganizerEvent(account) || !Array.isArray(requestedIds)) return null;
  const ids = requestedIds.map(id => typeof id === 'string' ? id.trim() : '');
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) return null;
  return [...new Set([...ids, account.id])];
}
