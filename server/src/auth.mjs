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
