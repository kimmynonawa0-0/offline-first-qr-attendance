#!/usr/bin/env node
// One-off recovery tool for a locked-out system manager.
//
// The running server deliberately keeps the existing manager hash in the
// database when MANAGER_PASSWORD changes, so redeploying does not reset a
// password. This script applies MANAGER_PASSWORD to the manager row directly.
// It needs the same DATABASE_URL the server uses, plus MANAGER_USERNAME and
// MANAGER_PASSWORD. In Docker, the container already has all three:
//
//   cd server
//   docker compose -f docker-compose.yml -f docker-compose.prod.yml exec server \
//     node scripts/reset-manager-password.mjs --confirm
//
// To run it from a trusted machine against an external database, set
// DATABASE_URL, MANAGER_USERNAME, and MANAGER_PASSWORD for that shell first.
//
// After signing in, change the password and create a fresh recovery code.

import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { passwordHashAsync } from '../src/sync.mjs';

const { DATABASE_URL, MANAGER_USERNAME, MANAGER_PASSWORD } = process.env;

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

if (!process.argv.includes('--confirm')) {
  fail('Refusing to reset the manager password without --confirm.');
}
if (!DATABASE_URL) fail('DATABASE_URL is not set.');
if (!MANAGER_USERNAME) fail('MANAGER_USERNAME is not set.');
if (!MANAGER_PASSWORD || MANAGER_PASSWORD.length < 12) {
  fail('MANAGER_PASSWORD is not set or is shorter than 12 characters.');
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

try {
  const salt = randomBytes(16).toString('hex');
  const hash = await passwordHashAsync(MANAGER_PASSWORD, salt);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE organizers
         SET salt = $2, password_hash = $3, credential_initialized = TRUE,
             must_change_password = TRUE, enabled = TRUE
       WHERE id = $1 AND access_level = 'manager'
       RETURNING id`,
      [MANAGER_USERNAME, salt, hash]
    );
    if (!updated.rowCount) {
      await client.query('ROLLBACK');
      throw new Error(`No manager account found for username "${MANAGER_USERNAME}".`);
    }
    await client.query('DELETE FROM organizer_sessions WHERE organizer_id = $1', [MANAGER_USERNAME]);
    await client.query('DELETE FROM manager_recovery_codes WHERE manager_id = $1', [MANAGER_USERNAME]);
    await client.query('COMMIT');
    console.log(`Manager account "${MANAGER_USERNAME}" was reset to the MANAGER_PASSWORD value.`);
    console.log('Existing manager sessions were revoked. Sign in now, change the password, and create a new recovery code.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
