import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function createManagerRecoveryCode() {
  return randomBytes(32).toString('base64url');
}

export function hashManagerRecoveryCode(code) {
  return createHash('sha256').update(code).digest('hex');
}

export function managerRecoveryCodeMatches(code, storedHash) {
  if (typeof code !== 'string' || typeof storedHash !== 'string' || !/^[a-f0-9]{64}$/.test(storedHash)) return false;
  const actualHash = Buffer.from(hashManagerRecoveryCode(code), 'hex');
  const expectedHash = Buffer.from(storedHash, 'hex');
  return timingSafeEqual(actualHash, expectedHash);
}
