import { createHash, randomBytes } from 'node:crypto';

export function createOrganizerSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
