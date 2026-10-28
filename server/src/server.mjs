import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { passwordHash, passwordMatchesAsync, passwordHashAsync, saveBatch, validateBatch } from './sync.mjs';
import { provisionRoster } from './roster.mjs';
import { parseRosterFile } from './roster-file.mjs';
import { validateManagedStudent } from './management-students.mjs';
import { canCreateOrganizerEvent, canImportRoster, createOrganizerSessionToken, hashSessionToken, loginClientRoleError, organizerEventAssigneeIds, rosterScopeError } from './auth.mjs';
import { corsDecision, parseWebOrigins } from './cors.mjs';
import { createManagerRecoveryCode, hashManagerRecoveryCode, managerRecoveryCodeMatches } from './manager-recovery.mjs';

const { DATABASE_URL, ADMIN_ID, ADMIN_PASSWORD, MANAGER_ID, MANAGER_PASSWORD, PORT = '3000' } = process.env;
if (!DATABASE_URL || !ADMIN_ID || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12
  || !MANAGER_ID || !MANAGER_PASSWORD || MANAGER_PASSWORD.length < 12
  || MANAGER_ID === ADMIN_ID || MANAGER_PASSWORD === ADMIN_PASSWORD) {
  throw new Error('Set DATABASE_URL, distinct organizer and manager IDs/passwords; both passwords need at least 12 characters.');
}
const pool = new pg.Pool({ connectionString: DATABASE_URL });
const allowedWebOrigins = parseWebOrigins(process.env.WEB_ORIGINS);
await pool.query(`CREATE TABLE IF NOT EXISTS organizers (
  id TEXT PRIMARY KEY, salt TEXT NOT NULL, password_hash TEXT NOT NULL,
  credential_initialized BOOLEAN NOT NULL DEFAULT FALSE,
  access_level TEXT NOT NULL DEFAULT 'organizer', enabled BOOLEAN NOT NULL DEFAULT TRUE,
  name TEXT NOT NULL DEFAULT 'Organizer', section TEXT NOT NULL DEFAULT '',
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS organizer_sessions (
  token_hash TEXT PRIMARY KEY, organizer_id TEXT NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, section TEXT NOT NULL, email TEXT NOT NULL DEFAULT '',
  password_salt TEXT, password_hash TEXT, must_change_password BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS student_sessions (
  token_hash TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, location TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS event_organizers (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  organizer_id TEXT NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, organizer_id)
);
CREATE TABLE IF NOT EXISTS management_audit (
  id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES organizers(id), action TEXT NOT NULL,
  entity_id TEXT NOT NULL, details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL, student_name TEXT NOT NULL,
  event_id TEXT NOT NULL, event_name TEXT NOT NULL, location TEXT NOT NULL,
  recorded_at TEXT NOT NULL, attendance_date TEXT, attendance_time TEXT, method TEXT NOT NULL,
  UNIQUE (event_id, student_id)
);`);
await pool.query(`ALTER TABLE organizers ADD COLUMN IF NOT EXISTS access_level TEXT NOT NULL DEFAULT 'organizer';
await pool.query(`CREATE TABLE IF NOT EXISTS manager_recovery_codes (
  manager_id TEXT PRIMARY KEY REFERENCES organizers(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);
  ALTER TABLE organizers ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;
  ALTER TABLE organizers ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Organizer';
  ALTER TABLE organizers ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT '';
  ALTER TABLE organizers ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE students ADD COLUMN IF NOT EXISTS password_salt TEXT;
  ALTER TABLE students ADD COLUMN IF NOT EXISTS password_hash TEXT;
  ALTER TABLE students ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT TRUE;`);
await pool.query(`ALTER TABLE attendance ADD COLUMN IF NOT EXISTS attendance_date TEXT;
  ALTER TABLE attendance ADD COLUMN IF NOT EXISTS attendance_time TEXT;
  CREATE INDEX IF NOT EXISTS attendance_student_recorded_at_idx ON attendance (student_id, recorded_at DESC);`);
const organizerSalt = randomBytes(16).toString('hex');
await pool.query(`INSERT INTO organizers (id, salt, password_hash, credential_initialized, access_level, name)
  VALUES ($1, $2, $3, FALSE, 'organizer', 'Pilot Organizer')
  ON CONFLICT (id) DO NOTHING`,
  [ADMIN_ID, organizerSalt, passwordHash(ADMIN_PASSWORD, organizerSalt)]);
const managerStudent = await pool.query('SELECT 1 FROM students WHERE id = $1', [MANAGER_ID]);
if (managerStudent.rowCount) throw new Error('MANAGER_ID must not match a student in the roster.');
await pool.query(`DELETE FROM organizer_sessions WHERE organizer_id = $1
  AND EXISTS (SELECT 1 FROM organizers WHERE id = $1 AND access_level <> 'manager')`, [MANAGER_ID]);
const managerSalt = randomBytes(16).toString('hex');
await pool.query(`INSERT INTO organizers (id, salt, password_hash, credential_initialized, access_level, name, must_change_password)
  VALUES ($1, $2, $3, TRUE, 'manager', 'System Manager', TRUE)
  ON CONFLICT (id) DO UPDATE SET
    salt = CASE WHEN organizers.access_level = 'manager' THEN organizers.salt ELSE EXCLUDED.salt END,
    password_hash = CASE WHEN organizers.access_level = 'manager' THEN organizers.password_hash ELSE EXCLUDED.password_hash END,
    credential_initialized = TRUE,
    access_level = 'manager', enabled = TRUE, name = 'System Manager',
    must_change_password = CASE WHEN organizers.access_level = 'manager' THEN organizers.must_change_password ELSE TRUE END`,
  [MANAGER_ID, managerSalt, passwordHash(MANAGER_PASSWORD, managerSalt)]);
await pool.query(`UPDATE organizers SET access_level = 'organizer' WHERE id = $1 AND id <> $2`, [ADMIN_ID, MANAGER_ID]);
await pool.query(`UPDATE organizers o SET section = s.section, name = s.name
  FROM students s WHERE o.id = s.id AND o.access_level = 'organizer'
  AND (o.section = '' OR o.name = 'Organizer')`);
await pool.query('ALTER TABLE organizers ADD COLUMN IF NOT EXISTS credential_initialized BOOLEAN NOT NULL DEFAULT FALSE');
await pool.query(`ALTER TABLE organizer_sessions ALTER COLUMN expires_at DROP NOT NULL;
  DELETE FROM organizer_sessions WHERE expires_at <= NOW();
  UPDATE organizer_sessions SET expires_at = NULL;`);

async function organizerForRequest(request) {
  const token = request.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{40,})$/)?.[1];
  if (!token) return null;
  const result = await pool.query(`SELECT o.id, o.access_level, o.name, o.section, o.must_change_password
    FROM organizer_sessions s JOIN organizers o ON o.id = s.organizer_id
    WHERE s.token_hash = $1 AND o.enabled = TRUE`, [hashSessionToken(token)]);
  return result.rows[0] || null;
}

function bearerToken(request) {
  return request.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{40,})$/)?.[1] || null;
}

async function studentForRequest(request) {
  const token = bearerToken(request);
  if (!token) return null;
  const result = await pool.query(`SELECT s.id, s.name, s.section, s.email, s.must_change_password
    FROM student_sessions ss JOIN students s ON s.id = ss.student_id
    WHERE ss.token_hash = $1`, [hashSessionToken(token)]);
  return result.rows[0] || null;
}

function isManager(account) { return account?.access_level === 'manager' && !account.must_change_password; }
async function writeAudit(client, actorId, action, entityId, details = {}) {
  await client.query('INSERT INTO management_audit (id, actor_id, action, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
    [randomUUID(), actorId, action, entityId, JSON.stringify(details)]);
}
function validEvent(event) {
  if (!event || !['id', 'name', 'location', 'date', 'time'].every(key =>
    typeof event[key] === 'string' && event[key].trim() && event[key].length <= 200)) return false;
  const parsedDate = new Date(`${event.date}T12:00:00`);
  return /^\d{4}-\d{2}-\d{2}$/.test(event.date) && !Number.isNaN(parsedDate.getTime())
    && parsedDate.toISOString().slice(0, 10) === event.date && /^([01]\d|2[0-3]):[0-5]\d$/.test(event.time);
}

const server = http.createServer(async (request, response) => {
  const send = (status, result) => {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(result));
  };
  const forwardedProtocol = request.headers['x-forwarded-proto']?.split(',')[0]?.trim();
  const protocol = forwardedProtocol || (request.socket.encrypted ? 'https' : 'http');
  const serviceOrigin = request.headers.host ? `${protocol}://${request.headers.host}` : '';
  const cors = corsDecision(request.headers.origin, allowedWebOrigins, serviceOrigin);
  if (!cors.allowed) return send(403, { error: 'This web origin is not allowed to use the attendance API.' });
  for (const [name, value] of Object.entries(cors.headers)) response.setHeader(name, value);
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method === 'GET' && request.url === '/health') {
    try { await pool.query('SELECT 1'); send(200, { ok: true }); }
    catch { send(503, { error: 'Database unavailable.' }); }
    return;
  }
  const pagePath = request.url.split('?')[0];
  if (request.method === 'GET' && pagePath === '/manager') {
    try {
      const page = await readFile(new URL('../public/manager.html', import.meta.url));
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(page);
    } catch (error) {
      console.error('Management page could not be loaded:', error);
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Management page is not available on this server build.' }));
    }
    return;
  }
  let body = {};
  try {
    if (!['GET', 'HEAD'].includes(request.method)) {
      let raw = '';
      for await (const chunk of request) {
        raw += chunk;
        if (raw.length > 8 * 1024 * 1024) return send(413, { error: 'Request body is too large.' });
      }
      body = JSON.parse(raw || '{}');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return send(400, { error: 'Request body must be a JSON object.' });
    if (request.method === 'POST' && request.url === '/auth/login') {
      if (typeof body.id !== 'string' || typeof body.password !== 'string') return send(400, { error: 'Student ID and password are required.' });
      const organizer = await pool.query('SELECT id, salt, password_hash, credential_initialized, must_change_password FROM organizers WHERE id = $1', [body.id.trim()]);
      if (organizer.rows[0]) {
        const profile = await pool.query('SELECT enabled, access_level, name, section FROM organizers WHERE id = $1', [body.id.trim()]);
        if (profile.rows[0]?.enabled) {
        const mustChangePassword = organizer.rows[0].must_change_password;
        let validPassword = await passwordMatchesAsync(body.password, organizer.rows[0].salt, organizer.rows[0].password_hash);
        if (!validPassword && !organizer.rows[0].credential_initialized
          && ((organizer.rows[0].id === ADMIN_ID && body.password === ADMIN_PASSWORD)
            || (organizer.rows[0].id === MANAGER_ID && body.password === MANAGER_PASSWORD))) {
          const salt = randomBytes(16).toString('hex');
          await pool.query('UPDATE organizers SET salt = $2, password_hash = $3, credential_initialized = TRUE WHERE id = $1',
            [organizer.rows[0].id, salt, await passwordHashAsync(body.password, salt)]);
          validPassword = true;
        } else if (validPassword && !organizer.rows[0].credential_initialized) {
          await pool.query('UPDATE organizers SET credential_initialized = TRUE WHERE id = $1', [organizer.rows[0].id]);
        }
        if (!validPassword) {
          return send(401, { error: 'Invalid student ID or password.' });
        }
        const roleError = loginClientRoleError(body.client, profile.rows[0].access_level);
        if (roleError) return send(403, { error: roleError });
        const token = createOrganizerSessionToken();
        const previousToken = request.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{40,})$/)?.[1];
        if (previousToken) await pool.query('DELETE FROM organizer_sessions WHERE token_hash = $1 AND organizer_id = $2',
          [hashSessionToken(previousToken), organizer.rows[0].id]);
        await pool.query('INSERT INTO organizer_sessions (token_hash, organizer_id) VALUES ($1, $2)',
          [hashSessionToken(token), organizer.rows[0].id]);
        return send(200, { account: { id: organizer.rows[0].id, name: profile.rows[0].name, section: profile.rows[0].section,
          role: 'admin', accessLevel: profile.rows[0].access_level, mustChangePassword }, sessionToken: token });
        }
      }
      const result = await pool.query('SELECT id, name, section, email, password_salt, password_hash, must_change_password FROM students WHERE id = $1', [body.id.trim()]);
      const student = result.rows[0];
      if (!student?.password_hash || !await passwordMatchesAsync(body.password, student.password_salt, student.password_hash)) {
        return send(401, { error: 'Invalid student ID or password. Contact your faculty if your account has not been imported.' });
      }
      const token = createOrganizerSessionToken();
      const previousToken = bearerToken(request);
      if (previousToken) await pool.query('DELETE FROM student_sessions WHERE token_hash = $1 AND student_id = $2',
        [hashSessionToken(previousToken), student.id]);
      await pool.query('INSERT INTO student_sessions (token_hash, student_id) VALUES ($1, $2)',
        [hashSessionToken(token), student.id]);
      return send(200, { account: { id: student.id, name: student.name, section: student.section, email: student.email,
        role: 'student', mustChangePassword: student.must_change_password }, sessionToken: token });
    }
    if (request.method === 'POST' && request.url === '/auth/password') {
      const studentSession = await studentForRequest(request);
      if (!studentSession) return send(401, { error: 'Your student session expired or was revoked. Log in again.' });
      if (typeof body.id !== 'string' || typeof body.currentPassword !== 'string' || typeof body.newPassword !== 'string') {
        return send(400, { error: 'Student ID and both passwords are required.' });
      }
      if (body.id.trim() !== studentSession.id) return send(403, { error: 'You can only change your own password.' });
      if (body.newPassword.trim().length < 12) return send(400, { error: 'Use at least 12 characters for your new password.' });
      const result = await pool.query('SELECT section, password_salt, password_hash FROM students WHERE id = $1', [body.id.trim()]);
      const student = result.rows[0];
      if (!student?.password_hash || !await passwordMatchesAsync(body.currentPassword, student.password_salt, student.password_hash)) return send(401, { error: 'Your current password could not be verified.' });
      if (body.newPassword.trim().toLowerCase() === student.section.trim().toLowerCase() || body.newPassword === body.currentPassword) {
        return send(400, { error: 'Choose a new password, not your section or current password.' });
      }
      const salt = randomBytes(16).toString('hex');
      await pool.query('UPDATE students SET password_salt = $2, password_hash = $3, must_change_password = FALSE WHERE id = $1',
        [body.id.trim(), salt, await passwordHashAsync(body.newPassword, salt)]);
      await pool.query('DELETE FROM student_sessions WHERE student_id = $1 AND token_hash <> $2',
        [studentSession.id, hashSessionToken(bearerToken(request))]);
      return send(200, { ok: true });
    }
    if (request.method === 'POST' && request.url === '/auth/admin/password') {
      const organizerAccount = await organizerForRequest(request);
      if (!organizerAccount) return send(401, { error: 'Your organizer session expired or was revoked. Log in again.' });
      if (typeof body.currentPassword !== 'string' || typeof body.newPassword !== 'string') return send(400, { error: 'Current and new passwords are required.' });
      if (body.newPassword.trim().length < 12) return send(400, { error: 'Use at least 12 characters for your new password.' });
      const organizer = await pool.query('SELECT salt, password_hash FROM organizers WHERE id = $1', [organizerAccount.id]);
      if (!organizer.rows[0] || !await passwordMatchesAsync(body.currentPassword, organizer.rows[0].salt, organizer.rows[0].password_hash)) {
        return send(401, { error: 'Your current password could not be verified.' });
      }
      const salt = randomBytes(16).toString('hex');
      if (body.newPassword === body.currentPassword) return send(400, { error: 'Choose a new password different from your current password.' });
      const hash = await passwordHashAsync(body.newPassword, salt);
      const token = createOrganizerSessionToken();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`UPDATE organizers SET salt = $2, password_hash = $3,
          credential_initialized = TRUE, must_change_password = FALSE WHERE id = $1`, [organizerAccount.id, salt, hash]);
        await client.query(`UPDATE students SET password_salt = $2, password_hash = $3, must_change_password = FALSE
          WHERE id = $1`, [organizerAccount.id, salt, hash]);
        await client.query('DELETE FROM student_sessions WHERE student_id = $1', [organizerAccount.id]);
        await client.query('DELETE FROM organizer_sessions WHERE organizer_id = $1', [organizerAccount.id]);
        await client.query('INSERT INTO organizer_sessions (token_hash, organizer_id) VALUES ($1, $2)',
          [hashSessionToken(token), organizerAccount.id]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
      return send(200, { ok: true, sessionToken: token });
    }
    if (request.method === 'POST' && request.url === '/auth/logout') {
      const token = request.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{40,})$/)?.[1];
      if (token) {
        await pool.query('DELETE FROM organizer_sessions WHERE token_hash = $1', [hashSessionToken(token)]);
        await pool.query('DELETE FROM student_sessions WHERE token_hash = $1', [hashSessionToken(token)]);
      }
      return send(200, { ok: true });
    }
    if (request.method === 'POST' && request.url === '/student/attendance') {
    if (request.method === 'POST' && request.url === '/auth/admin/recovery-code') {
      const account = await organizerForRequest(request);
      if (!isManager(account) || account.id !== MANAGER_ID) return send(403, { error: 'Only the signed-in system manager can create a recovery code.' });
      const recoveryCode = createManagerRecoveryCode();
      await pool.query(`INSERT INTO manager_recovery_codes (manager_id, code_hash)
        VALUES ($1, $2) ON CONFLICT (manager_id) DO UPDATE SET code_hash = EXCLUDED.code_hash, created_at = NOW()`,
      [MANAGER_ID, hashManagerRecoveryCode(recoveryCode)]);
      return send(200, { recoveryCode });
    }
    if (request.method === 'POST' && request.url === '/auth/admin/password-reset') {
      if (typeof body.id !== 'string' || typeof body.recoveryCode !== 'string' || typeof body.newPassword !== 'string') {
        return send(400, { error: 'Manager ID, recovery code, and new password are required.' });
      }
      if (body.id.trim() !== MANAGER_ID) return send(401, { error: 'The manager ID or recovery code is invalid.' });
      if (body.newPassword.trim().length < 12) return send(400, { error: 'Use at least 12 characters for your new password.' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const stored = await client.query('SELECT code_hash FROM manager_recovery_codes WHERE manager_id = $1 FOR UPDATE', [MANAGER_ID]);
        if (!stored.rows[0] || !managerRecoveryCodeMatches(body.recoveryCode, stored.rows[0].code_hash)) {
          await client.query('ROLLBACK');
          return send(401, { error: 'The manager ID or recovery code is invalid.' });
        }
        const salt = randomBytes(16).toString('hex');
        const hash = await passwordHashAsync(body.newPassword, salt);
        await client.query(`UPDATE organizers SET salt = $2, password_hash = $3,
          credential_initialized = TRUE, must_change_password = FALSE WHERE id = $1 AND access_level = 'manager'`,
        [MANAGER_ID, salt, hash]);
        await client.query('DELETE FROM organizer_sessions WHERE organizer_id = $1', [MANAGER_ID]);
        await client.query('DELETE FROM manager_recovery_codes WHERE manager_id = $1', [MANAGER_ID]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
      return send(200, { ok: true });
    }
      const student = await studentForRequest(request);
      if (!student) return send(401, { error: 'Your student session expired or was revoked. Log in again.' });
      const result = await pool.query(`SELECT id, student_id, student_name, event_id, event_name, location,
          recorded_at, attendance_date, attendance_time, method
        FROM attendance WHERE student_id = $1 ORDER BY recorded_at DESC, id`, [student.id]);
      return send(200, { records: result.rows.map(record => ({
        id: record.id, studentId: record.student_id, studentName: record.student_name,
        eventId: record.event_id, event: record.event_name || 'Attendance', location: record.location,
        recordedAt: record.recorded_at,
        date: record.attendance_date || record.recorded_at.slice(0, 10),
        time: record.attendance_time || new Date(record.recorded_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
        status: 'PRESENT', method: record.method, synced: true,
      })) });
    }
    if (request.method === 'POST' && request.url === '/roster/upload') {
      const account = await organizerForRequest(request);
      if (!account) return send(401, { error: 'Your session expired or was revoked. Log in again.' });
      if (!canImportRoster(account)) return send(403, { error: account.must_change_password ? 'Change your temporary password before importing a roster.' : 'Your organizer profile needs a roster section before importing.' });
      const scopeError = rosterScopeError(account, body.students);
      if (scopeError) return send(403, { error: scopeError });
      if (Array.isArray(body.students) && body.students.some(student => student?.id?.trim?.() === MANAGER_ID)) {
        return send(400, { error: 'The system manager ID cannot also be imported as a student.' });
      }
      const client = await pool.connect();
      try {
        const counts = await provisionRoster(client, body.students);
        try { await writeAudit(client, account.id, 'roster_import', 'student_roster', counts); }
        catch (error) { console.error('Could not record roster import in the audit log:', error); }
        return send(200, counts);
      }
      finally { client.release(); }
    }
    if (request.method === 'POST' && request.url === '/roster/preview') {
      const account = await organizerForRequest(request);
      if (!account) return send(401, { error: 'Your session expired or was revoked. Log in again.' });
      if (!canImportRoster(account)) return send(403, { error: account.must_change_password ? 'Change your temporary password before importing a roster.' : 'Your organizer profile needs a roster section before importing.' });
      const students = parseRosterFile(body.fileName, body.fileBase64);
      const scopeError = rosterScopeError(account, students);
      if (scopeError) return send(403, { error: scopeError });
      if (students.some(student => student.id === MANAGER_ID)) return send(400, { error: 'The system manager ID cannot also be imported as a student.' });
      return send(200, { students });
    }
    if (request.method === 'POST' && request.url === '/organizer/events') {
      const organizer = await organizerForRequest(request);
      if (!organizer) return send(401, { error: 'Your organizer session expired or was revoked. Log in again.' });
      if (!canCreateOrganizerEvent(organizer)) return send(403, { error: organizer.access_level === 'manager' ? 'System managers create and assign events at /manager.' : 'Change your temporary password before creating events.' });
      if (!validEvent(body.event)) return send(400, { error: 'Provide a valid event name, location, date, and time.' });
      const organizerIds = organizerEventAssigneeIds(organizer, body.organizerIds);
      if (!organizerIds) return send(400, { error: 'Choose valid, unique active organizers for this event.' });
      const activeOrganizers = await pool.query(`SELECT id FROM organizers WHERE id = ANY($1::text[])
        AND enabled = TRUE AND access_level = 'organizer'`, [organizerIds]);
      if (activeOrganizers.rows.length !== organizerIds.length) return send(400, { error: 'Every event assignee must have active organizer access.' });
      const event = body.event;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('INSERT INTO events (id, name, location, date, time) VALUES ($1, $2, $3, $4, $5)',
          [event.id.trim(), event.name.trim(), event.location.trim(), event.date.trim(), event.time.trim()]);
        for (const id of organizerIds) await client.query('INSERT INTO event_organizers (event_id, organizer_id) VALUES ($1, $2)', [event.id.trim(), id]);
        await writeAudit(client, organizer.id, 'event_created', event.id.trim(), { organizerIds });
        await client.query('COMMIT');
        return send(201, { event: { ...event, organizers: organizerIds.length } });
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
    if (request.method === 'GET' && request.url === '/organizer/available-organizers') {
      const organizer = await organizerForRequest(request);
      if (!organizer) return send(401, { error: 'Your organizer session expired or was revoked. Log in again.' });
      if (organizer.access_level !== 'organizer') return send(403, { error: 'Only event organizers can use this portal.' });
      if (organizer.must_change_password) return send(403, { error: 'Change your temporary password before creating events.' });
      const result = await pool.query(`SELECT id, name FROM organizers
        WHERE enabled = TRUE AND access_level = 'organizer' ORDER BY name, id`);
      return send(200, { organizers: result.rows });
    }
    if (request.method === 'GET' && request.url === '/organizer/bootstrap') {
      const organizer = await organizerForRequest(request);
      if (!organizer) return send(401, { error: 'Your organizer session expired or was revoked. Log in again.' });
      if (organizer.access_level !== 'organizer') return send(403, { error: 'System manager accounts use the management website, not the scanning app.' });
      if (organizer.must_change_password) return send(403, { error: 'Change your temporary password before downloading the student roster.' });
      const result = await pool.query(`SELECT e.id, e.name, e.location, e.date, e.time,
        (SELECT COALESCE(json_agg(json_build_object('id', assigned.id, 'name', assigned.name)), '[]')
          FROM event_organizers links JOIN organizers assigned ON assigned.id = links.organizer_id
          WHERE links.event_id = e.id AND assigned.enabled = TRUE) AS organizers
        FROM events e JOIN event_organizers own ON own.event_id = e.id
        WHERE own.organizer_id = $1 ORDER BY e.date, e.time, e.name`, [organizer.id]);
      const students = organizer.access_level === 'manager'
        ? await pool.query('SELECT id, name, section FROM students ORDER BY id')
        : await pool.query('SELECT id, name, section FROM students WHERE section = $1 ORDER BY id', [organizer.section]);
      return send(200, { events: result.rows.map(event => ({ ...event, attendees: [] })), students: students.rows });
    }
    if (request.method === 'GET' && request.url === '/organizer/attendance') {
      const organizer = await organizerForRequest(request);
      if (!organizer) return send(401, { error: 'Your organizer session expired or was revoked. Log in again.' });
      if (organizer.access_level !== 'organizer') return send(403, { error: 'System manager accounts use the management website.' });
      if (organizer.must_change_password) return send(403, { error: 'Change your temporary password before viewing attendance.' });
      const result = await pool.query(`SELECT a.id, a.student_id, a.student_name, a.event_id, a.event_name,
        a.location, a.recorded_at, a.method FROM attendance a
        JOIN event_organizers eo ON eo.event_id = a.event_id
        WHERE eo.organizer_id = $1 ORDER BY a.recorded_at DESC LIMIT 500`, [organizer.id]);
      return send(200, { records: result.rows });
    }
    if (request.method === 'GET' && request.url === '/management/overview') {
      const manager = await organizerForRequest(request);
      if (!manager) return send(401, { error: 'Sign in to the management website.' });
      if (!isManager(manager)) return send(403, { error: 'Only a system manager can use management tools.' });
      const [students, organizers, events, attendance, audit] = await Promise.all([
        pool.query('SELECT id, name, section, email, must_change_password FROM students ORDER BY section, name'),
        pool.query(`SELECT o.id, o.name, o.enabled, o.access_level,
          (SELECT COUNT(*)::int FROM event_organizers eo WHERE eo.organizer_id = o.id) AS assigned_events
          FROM organizers o ORDER BY o.name, o.id`),
        pool.query(`SELECT e.id, e.name, e.location, e.date, e.time,
          COALESCE(json_agg(json_build_object('id', o.id, 'name', o.name)) FILTER (WHERE o.id IS NOT NULL), '[]') AS organizers,
          (SELECT COUNT(*)::int FROM attendance a WHERE a.event_id = e.id) AS attendance_count
          FROM events e LEFT JOIN event_organizers eo ON eo.event_id = e.id
          LEFT JOIN organizers o ON o.id = eo.organizer_id
          GROUP BY e.id ORDER BY e.date DESC, e.time DESC`),
        pool.query('SELECT COUNT(*)::int AS count FROM attendance'),
        pool.query(`SELECT a.id, a.actor_id, o.name AS actor_name, a.action, a.entity_id, a.details, a.created_at
          FROM management_audit a JOIN organizers o ON o.id = a.actor_id
          ORDER BY a.created_at DESC LIMIT 25`),
      ]);
      return send(200, { students: students.rows, organizers: organizers.rows, events: events.rows,
        attendanceCount: attendance.rows[0].count, audit: audit.rows });
    }
    if (request.method === 'POST' && request.url === '/management/students') {
      const manager = await organizerForRequest(request);
      if (!manager) return send(401, { error: 'Sign in to the management website.' });
      if (!isManager(manager)) return send(403, { error: 'Only a system manager can manage student accounts.' });
      let student;
      try { student = validateManagedStudent(body); }
      catch (error) { return send(400, { error: error.message }); }
      if (student.id === MANAGER_ID) return send(400, { error: 'The system manager ID cannot be used for a student account.' });
      const salt = randomBytes(16).toString('hex');
      const hash = await passwordHashAsync(student.section, salt);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const existingOrganizer = await client.query('SELECT id FROM organizers WHERE id = $1', [student.id]);
        if (existingOrganizer.rowCount) {
          await client.query('ROLLBACK');
          return send(409, { error: 'This ID already has organizer access. Edit the existing student record instead.' });
        }
        await client.query(`INSERT INTO students (id, name, section, email, password_salt, password_hash, must_change_password)
          VALUES ($1, $2, $3, $4, $5, $6, TRUE)`, [student.id, student.name, student.section, student.email, salt, hash]);
        await writeAudit(client, manager.id, 'student_created', student.id, { section: student.section });
        await client.query('COMMIT');
        return send(201, { student: { ...student, must_change_password: true } });
      } catch (error) {
        await client.query('ROLLBACK');
        if (error.code === '23505') return send(409, { error: 'A student with this ID already exists.' });
        throw error;
      } finally { client.release(); }
    }
    if (request.method === 'PATCH' && request.url.startsWith('/management/students/')) {
      const manager = await organizerForRequest(request);
      if (!manager) return send(401, { error: 'Sign in to the management website.' });
      if (!isManager(manager)) return send(403, { error: 'Only a system manager can manage student accounts.' });
      const encodedId = request.url.slice('/management/students/'.length);
      if (!encodedId || encodedId.includes('/')) return send(404, { error: 'Student account was not found.' });
      const studentId = decodeURIComponent(encodedId);
      let student;
      try { student = validateManagedStudent({ ...body, id: studentId }); }
      catch (error) { return send(400, { error: error.message }); }
      if (student.id === MANAGER_ID) return send(400, { error: 'The system manager ID cannot be edited as a student.' });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const previous = await client.query('SELECT section, email, name, must_change_password FROM students WHERE id = $1 FOR UPDATE', [studentId]);
        if (!previous.rows[0]) {
          await client.query('ROLLBACK');
          return send(404, { error: 'Student account was not found.' });
        }
        const sectionChanged = previous.rows[0].section !== student.section;
        let tempCredential = null;
        if (sectionChanged && previous.rows[0].must_change_password) {
          const salt = randomBytes(16).toString('hex');
          tempCredential = { salt, hash: await passwordHashAsync(student.section, salt) };
          await client.query(`UPDATE students SET name = $2, section = $3, email = $4, password_salt = $5, password_hash = $6
            WHERE id = $1`, [studentId, student.name, student.section, student.email, salt, tempCredential.hash]);
          await client.query(`UPDATE organizers SET name = $2, section = $3, salt = $4, password_hash = $5,
            credential_initialized = TRUE, must_change_password = TRUE WHERE id = $1 AND access_level = 'organizer'`,
          [studentId, student.name, student.section, salt, tempCredential.hash]);
        } else {
          await client.query('UPDATE students SET name = $2, section = $3, email = $4 WHERE id = $1',
            [studentId, student.name, student.section, student.email]);
          await client.query("UPDATE organizers SET name = $2, section = $3 WHERE id = $1 AND access_level = 'organizer'",
            [studentId, student.name, student.section]);
        }
        if (sectionChanged) {
          await client.query('DELETE FROM organizer_sessions WHERE organizer_id = $1', [studentId]);
          await client.query('DELETE FROM student_sessions WHERE student_id = $1', [studentId]);
        }
        await writeAudit(client, manager.id, 'student_updated', studentId, {
          sectionChanged, emailChanged: previous.rows[0].email !== student.email,
          nameChanged: previous.rows[0].name !== student.name,
        });
        await client.query('COMMIT');
        return send(200, { student: { ...student, must_change_password: Boolean(tempCredential || previous.rows[0].must_change_password) } });
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
    if (request.method === 'POST' && request.url.startsWith('/management/students/') && request.url.endsWith('/password-reset')) {
      const manager = await organizerForRequest(request);
      if (!manager) return send(401, { error: 'Sign in to the management website.' });
      if (!isManager(manager)) return send(403, { error: 'Only a system manager can reset student passwords.' });
      const encodedId = request.url.slice('/management/students/'.length, -'/password-reset'.length);
      if (!encodedId || encodedId.includes('/')) return send(404, { error: 'Student account was not found.' });
      const studentId = decodeURIComponent(encodedId);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query('SELECT section FROM students WHERE id = $1 FOR UPDATE', [studentId]);
        if (!result.rows[0]) {
          await client.query('ROLLBACK');
          return send(404, { error: 'Student account was not found.' });
        }
        const salt = randomBytes(16).toString('hex');
        const hash = await passwordHashAsync(result.rows[0].section, salt);
        await client.query(`UPDATE students SET password_salt = $2, password_hash = $3, must_change_password = TRUE WHERE id = $1`,
          [studentId, salt, hash]);
        await client.query('DELETE FROM student_sessions WHERE student_id = $1', [studentId]);
        await client.query(`UPDATE organizers SET salt = $2, password_hash = $3, credential_initialized = TRUE,
          must_change_password = TRUE WHERE id = $1 AND access_level = 'organizer'`, [studentId, salt, hash]);
        await client.query('DELETE FROM organizer_sessions WHERE organizer_id = $1', [studentId]);
        await writeAudit(client, manager.id, 'student_password_reset', studentId, {});
        await client.query('COMMIT');
        return send(200, { ok: true, mustChangePassword: true });
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
    if (request.method === 'DELETE' && request.url.startsWith('/management/students/')) {
      const manager = await organizerForRequest(request);
      if (!manager) return send(401, { error: 'Sign in to the management website.' });
      if (!isManager(manager)) return send(403, { error: 'Only a system manager can delete student accounts.' });
      const encodedId = request.url.slice('/management/students/'.length);
      if (!encodedId || encodedId.includes('/')) return send(404, { error: 'Student account was not found.' });
      const studentId = decodeURIComponent(encodedId);
      if (studentId === MANAGER_ID) return send(400, { error: 'The system manager account cannot be deleted as a student.' });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query('SELECT name, section FROM students WHERE id = $1 FOR UPDATE', [studentId]);
        if (!result.rows[0]) {
          await client.query('ROLLBACK');
          return send(404, { error: 'Student account was not found.' });
        }
        await client.query('DELETE FROM organizer_sessions WHERE organizer_id = $1', [studentId]);
        await client.query("DELETE FROM organizers WHERE id = $1 AND access_level = 'organizer'", [studentId]);
        await client.query('DELETE FROM students WHERE id = $1', [studentId]);
        await writeAudit(client, manager.id, 'student_deleted', studentId, { section: result.rows[0].section });
        await client.query('COMMIT');
        return send(200, { ok: true, attendanceHistoryPreserved: true });
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
    if (request.method === 'POST' && request.url === '/management/organizers') {
      const manager = await organizerForRequest(request);
      if (!manager) return send(401, { error: 'Sign in to the management website.' });
      if (!isManager(manager)) return send(403, { error: 'Only a system manager can manage organizer access.' });
      if (typeof body.studentId !== 'string' || !body.studentId.trim()) return send(400, { error: 'Enter a student ID from the imported roster.' });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const promoted = await client.query(`INSERT INTO organizers (id, salt, password_hash, credential_initialized, access_level, enabled, name, section, must_change_password)
          SELECT id, password_salt, password_hash, NOT must_change_password, 'organizer', TRUE, name, section, must_change_password
          FROM students WHERE id = $1 AND password_hash IS NOT NULL
          ON CONFLICT (id) DO UPDATE SET enabled = TRUE, name = EXCLUDED.name, section = EXCLUDED.section
          RETURNING id, name, section, enabled, access_level`, [body.studentId.trim()]);
        if (!promoted.rows[0]) {
          await client.query('ROLLBACK');
          return send(404, { error: 'That student must be imported and have a password before organizer access can be granted.' });
        }
        await writeAudit(client, manager.id, 'organizer_granted', promoted.rows[0].id, {});
        await client.query('COMMIT');
        return send(200, { organizer: promoted.rows[0] });
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
    if (request.method === 'PATCH' && request.url.startsWith('/management/organizers/')) {
      const manager = await organizerForRequest(request);
      if (!manager) return send(401, { error: 'Sign in to the management website.' });
      if (!isManager(manager)) return send(403, { error: 'Only a system manager can manage organizer access.' });
      const organizerId = decodeURIComponent(request.url.slice('/management/organizers/'.length));
      if (typeof body.enabled !== 'boolean') return send(400, { error: 'Choose whether organizer access is enabled.' });
      if (organizerId === MANAGER_ID && body.enabled !== true) return send(400, { error: 'The bootstrap system manager cannot be disabled here.' });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(`UPDATE organizers SET enabled = $2 WHERE id = $1
          RETURNING id, name, enabled, access_level`, [organizerId, body.enabled]);
        if (!result.rows[0]) { await client.query('ROLLBACK'); return send(404, { error: 'Organizer account was not found.' }); }
        if (!body.enabled) await client.query('DELETE FROM organizer_sessions WHERE organizer_id = $1', [organizerId]);
        await writeAudit(client, manager.id, body.enabled ? 'organizer_restored' : 'organizer_revoked', organizerId, {});
        await client.query('COMMIT');
        return send(200, { organizer: result.rows[0] });
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
    if (request.method === 'POST' && request.url === '/management/events') {
      const manager = await organizerForRequest(request);
      if (!manager) return send(401, { error: 'Sign in to the management website.' });
      if (!isManager(manager)) return send(403, { error: 'Only a system manager can create and assign events.' });
      if (!validEvent(body.event) || !Array.isArray(body.organizerIds) || body.organizerIds.length < 1) {
        return send(400, { error: 'Provide a valid event and at least one active organizer.' });
      }
      const ids = [...new Set(body.organizerIds.filter(id => typeof id === 'string'))];
      if (ids.length !== body.organizerIds.length) return send(400, { error: 'Organizer assignments contain invalid or duplicate IDs.' });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const active = await client.query('SELECT id FROM organizers WHERE id = ANY($1::text[]) AND enabled = TRUE', [ids]);
        if (active.rows.length !== ids.length) {
          await client.query('ROLLBACK');
          return send(400, { error: 'Every assigned organizer must have an active account.' });
        }
        const event = body.event;
        await client.query('INSERT INTO events (id, name, location, date, time) VALUES ($1, $2, $3, $4, $5)',
          [event.id.trim(), event.name.trim(), event.location.trim(), event.date.trim(), event.time.trim()]);
        for (const id of ids) await client.query('INSERT INTO event_organizers (event_id, organizer_id) VALUES ($1, $2)', [event.id.trim(), id]);
        await writeAudit(client, manager.id, 'event_created', event.id.trim(), { organizerIds: ids });
        await client.query('COMMIT');
        return send(201, { event: { ...event, organizers: ids.length } });
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
    if (request.method === 'GET' && request.url.startsWith('/management/attendance')) {
      const manager = await organizerForRequest(request);
      if (!manager) return send(401, { error: 'Sign in to the management website.' });
      if (!isManager(manager)) return send(403, { error: 'Only a system manager can view all attendance.' });
      const eventId = new URL(request.url, 'http://localhost').searchParams.get('eventId');
      const result = await pool.query(`SELECT id, student_id, student_name, event_id, event_name, location,
        recorded_at, method FROM attendance WHERE ($1::text IS NULL OR event_id = $1)
        ORDER BY recorded_at DESC`, [eventId]);
      return send(200, { records: result.rows });
    }
    if (request.method !== 'POST' || request.url !== '/sync') return send(404, { error: 'Not found.' });
    const organizer = await organizerForRequest(request);
    if (!organizer) return send(401, { error: 'Your organizer session expired or was revoked. Log in again.' });
    if (organizer.access_level !== 'organizer') return send(403, { error: 'System manager accounts cannot scan or sync attendance.' });
    if (organizer.must_change_password) return send(403, { error: 'Change your temporary password before syncing attendance.' });
    validateBatch(body);
    const eventIds = [...new Set([...body.events.map(event => event.id), ...body.records.map(record => record.eventId)])];
    const studentIds = [...new Set(body.records.map(record => record.studentId))];
    const events = eventIds.length ? await pool.query(isManager(organizer)
      ? 'SELECT id, name, location, date, time FROM events WHERE id = ANY($1::text[])'
      : `SELECT e.id, e.name, e.location, e.date, e.time FROM events e
        JOIN event_organizers eo ON eo.event_id = e.id WHERE eo.organizer_id = $1 AND e.id = ANY($2::text[])`,
    isManager(organizer) ? [eventIds] : [organizer.id, eventIds]) : { rows: [] };
    if (events.rows.length !== eventIds.length) {
      return send(403, { error: 'A synced event is missing or is not assigned to this organizer. Records remain saved on the device.' });
    }
    const students = studentIds.length
      ? await pool.query('SELECT id, name, section, email FROM students WHERE id = ANY($1::text[])', [studentIds])
      : { rows: [] };
    if (students.rows.length !== studentIds.length) {
      return send(403, { error: 'A scanned student is missing from the server roster. Records remain saved on the device.' });
    }
    if (!isManager(organizer) && students.rows.some(student => student.section !== organizer.section)) {
      return send(403, { error: 'A scanned student is outside this organizer section roster. Records remain saved on the device.' });
    }
    const eventById = new Map(events.rows.map(event => [event.id, event]));
    const studentById = new Map(students.rows.map(student => [student.id, student]));
    body.events = events.rows;
    body.students = students.rows;
    body.records = body.records.map(record => {
      const event = eventById.get(record.eventId);
      const student = studentById.get(record.studentId);
      return { ...record, studentName: student.name, event: event.name, location: event.location };
    });
    const client = await pool.connect();
    try { return send(200, await saveBatch(client, body)); }
    finally { client.release(); }
  } catch (error) {
    if (error instanceof SyntaxError || /Invalid|Missing|too large|credentials|Import between|Duplicate|email|row|Choose a|File needs|Do not include|Roster file|Unclosed|Malformed|Unexpected text/i.test(error.message)) {
      send(400, { error: error.message });
    } else if (error.code === '23505') {
      send(409, { error: 'That record already exists. Refresh the page and review the current data.' });
    } else {
      const requestId = randomBytes(6).toString('hex');
      console.error(`[request ${requestId}] ${request.method} ${request.url}`, error);
      const offlineMessage = request.url === '/roster/upload' ? 'Roster import failed on the server. No partial roster was saved.'
        : request.url === '/management/events' ? 'Event creation failed on the server. Refresh the event list before retrying.'
          : request.url === '/sync' ? 'Attendance sync failed. Records remain saved on this device.'
            : 'The server could not complete this request.';
      const unavailable = error.code?.startsWith('08') || ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'].includes(error.code);
      send(unavailable ? 503 : 500, { error: offlineMessage, requestId });
    }
  }
});
server.listen(Number(PORT), '0.0.0.0', () => console.log(`NORWEScan API listening on ${PORT}`));
