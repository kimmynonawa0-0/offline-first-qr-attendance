import test from 'node:test';
import assert from 'node:assert/strict';
import { createManagerRecoveryCode, hashManagerRecoveryCode, managerRecoveryCodeMatches } from './manager-recovery.mjs';

test('manager recovery codes are random and can be checked against their hash', () => {
  const code = createManagerRecoveryCode();
  const hash = hashManagerRecoveryCode(code);

  assert.equal(typeof code, 'string');
  assert.ok(code.length >= 40);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(managerRecoveryCodeMatches(code, hash), true);
  assert.equal(managerRecoveryCodeMatches(`${code}x`, hash), false);
  assert.equal(managerRecoveryCodeMatches(code, 'invalid'), false);
  assert.notEqual(createManagerRecoveryCode(), code);
});
