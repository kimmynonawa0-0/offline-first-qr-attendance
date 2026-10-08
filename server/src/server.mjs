import http from 'node:http';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { passwordHash, passwordMatchesAsync, passwordHashAsync, saveBatch, validateBatch } from './sync.mjs';
import { provisionRoster } from './roster.mjs';
import { createOrganizerSessionToken, hashSessionToken } from './auth.mjs';

const { DATABASE_URL, ADMIN_ID, ADMIN_PASSWORD, PORT = '3000' } = process.env;
if (!DATABASE_URL || !ADMIN_ID || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
  throw new Error('Set DATABASE_URL, ADMIN_ID, and ADMIN_PASSWORD (at least 12 characters).');
}
const pool = new pg.Pool({ connectionString: DATABASE_URL });
await pool.query(`CREATE TABLE IF NOT EXISTS organizers (
  id TEXT PRIMARY KEY, salt TEXT NOT NULL, password_hash TEXT NOT NULL,
  credential_initialized BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS organizer_sessions (
  token_hash TEXT PRIMARY KEY, organizer_id TEXT NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, section TEXT NOT NULL, email TEXT NOT NULL DEFAULT '',
  password_salt TEXT, password_hash TEXT, must_change_password BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, location TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL, student_name TEXT NOT NULL,
  event_id TEXT NOT NULL, event_name TEXT NOT NULL, location TEXT NOT NULL,
  recorded_at TEXT NOT NULL, attendance_date TEXT, attendance_time TEXT, method TEXT NOT NULL,
  UNIQUE (event_id, student_id)
);`);
await pool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS password_salt TEXT;
  ALTER TABLE students ADD COLUMN IF NOT EXISTS password_hash TEXT;
  ALTER TABLE students ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT TRUE;`);
await pool.query(`ALTER TABLE attendance ADD COLUMN IF NOT EXISTS attendance_date TEXT;
  ALTER TABLE attendance ADD COLUMN IF NOT EXISTS attendance_time TEXT;
  CREATE INDEX IF NOT EXISTS attendance_student_recorded_at_idx ON attendance (student_id, recorded_at DESC);`);
const salt = randomBytes(16).toString('hex');
await pool.query(`INSERT INTO organizers (id, salt, password_hash) VALUES ($1, $2, $3)
  ON CONFLICT (id) DO NOTHING`,
  [ADMIN_ID, salt, passwordHash(ADMIN_PASSWORD, salt)]);
await pool.query('ALTER TABLE organizers ADD COLUMN IF NOT EXISTS credential_initialized BOOLEAN NOT NULL DEFAULT FALSE');
await pool.query(`ALTER TABLE organizer_sessions ALTER COLUMN expires_at DROP NOT NULL;
  DELETE FROM organizer_sessions WHERE expires_at <= NOW();
  UPDATE organizer_sessions SET expires_at = NULL;`);

async function organizerForRequest(request) {
  const token = request.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{40,})$/)?.[1];
  if (!token) return null;
  const result = await pool.query('SELECT organizer_id FROM organizer_sessions WHERE token_hash = $1', [hashSessionToken(token)]);
  return result.rows[0]?.organizer_id || null;
}

const server = http.createServer(async (request, response) => {
  const send = (status, result) => {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(result));
  };
  if (request.method === 'GET' && request.url === '/health') {
    try { await pool.query('SELECT 1'); send(200, { ok: true }); }
    catch { send(503, { error: 'Database unavailable.' }); }
    return;
  }
  let raw = '';
  try {
    for await (const chunk of request) {
      raw += chunk;
      if (raw.length > 8 * 1024 * 1024) return send(413, { error: 'Sync batch is too large.' });
    }
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return send(400, { error: 'Request body must be a JSON object.' });
    if (request.method === 'POST' && request.url === '/auth/login') {
      if (typeof body.id !== 'string' || typeof body.password !== 'string') return send(400, { error: 'Student ID and password are required.' });
      const organizer = await pool.query('SELECT id, salt, password_hash, credential_initialized FROM organizers WHERE id = $1', [body.id.trim()]);
      if (organizer.rows[0]) {
        let validPassword = await passwordMatchesAsync(body.password, organizer.rows[0].salt, organizer.rows[0].password_hash);
        if (!validPassword && !organizer.rows[0].credential_initialized && body.password === ADMIN_PASSWORD) {
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
        const token = createOrganizerSessionToken();
        const previousToken = request.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{40,})$/)?.[1];
        if (previousToken) await pool.query('DELETE FROM organizer_sessions WHERE token_hash = $1 AND organizer_id = $2',
          [hashSessionToken(previousToken), organizer.rows[0].id]);
        await pool.query('INSERT INTO organizer_sessions (token_hash, organizer_id) VALUES ($1, $2)',
          [hashSessionToken(token), organizer.rows[0].id]);
        return send(200, { account: { id: organizer.rows[0].id, role: 'admin' }, sessionToken: token });
      }
      const result = await pool.query('SELECT id, name, section, email, password_salt, password_hash, must_change_password FROM students WHERE id = $1', [body.id.trim()]);
      const student = result.rows[0];
      if (!student?.password_hash || !await passwordMatchesAsync(body.password, student.password_salt, student.password_hash)) {
        return send(401, { error: 'Invalid student ID or password. Contact your faculty if your account has not been imported.' });
      }
      return send(200, { account: { id: student.id, name: student.name, section: student.section, email: student.email,
        role: 'student', mustChangePassword: student.must_change_password } });
    }
    if (request.method === 'POST' && request.url === '/auth/password') {
      if (typeof body.id !== 'string' || typeof body.currentPassword !== 'string' || typeof body.newPassword !== 'string') {
        return send(400, { error: 'Student ID and both passwords are required.' });
      }
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
      return send(200, { ok: true });
    }
    if (request.method === 'POST' && request.url === '/auth/admin/password') {
      const organizerId = await organizerForRequest(request);
      if (!organizerId) return send(401, { error: 'Your organizer session expired. Log in again.' });
      if (typeof body.currentPassword !== 'string' || typeof body.newPassword !== 'string') return send(400, { error: 'Current and new passwords are required.' });
      if (body.newPassword.trim().length < 12) return send(400, { error: 'Use at least 12 characters for your new password.' });
      const organizer = await pool.query('SELECT salt, password_hash FROM organizers WHERE id = $1', [organizerId]);
      if (!organizer.rows[0] || !await passwordMatchesAsync(body.currentPassword, organizer.rows[0].salt, organizer.rows[0].password_hash)) {
        return send(401, { error: 'Your current password could not be verified.' });
      }
      const salt = randomBytes(16).toString('hex');
      await pool.query('UPDATE organizers SET salt = $2, password_hash = $3, credential_initialized = TRUE WHERE id = $1',
        [organizerId, salt, await passwordHashAsync(body.newPassword, salt)]);
      const token = createOrganizerSessionToken();
      await pool.query('DELETE FROM organizer_sessions WHERE organizer_id = $1', [organizerId]);
      await pool.query('INSERT INTO organizer_sessions (token_hash, organizer_id) VALUES ($1, $2)',
        [hashSessionToken(token), organizerId]);
      return send(200, { ok: true, sessionToken: token });
    }
    if (request.method === 'POST' && request.url === '/auth/logout') {
      const token = request.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{40,})$/)?.[1];
      if (token) await pool.query('DELETE FROM organizer_sessions WHERE token_hash = $1', [hashSessionToken(token)]);
      return send(200, { ok: true });
    }
    if (request.method === 'POST' && request.url === '/student/attendance') {
      if (typeof body.id !== 'string' || typeof body.password !== 'string') return send(400, { error: 'Student ID and password are required.' });
      const account = await pool.query('SELECT password_salt, password_hash FROM students WHERE id = $1', [body.id.trim()]);
      const student = account.rows[0];
      if (!student?.password_hash || !await passwordMatchesAsync(body.password, student.password_salt, student.password_hash)) {
        return send(401, { error: 'Student ID or password could not be verified.' });
      }
      const result = await pool.query(`SELECT id, student_id, student_name, event_id, event_name, location,
          recorded_at, attendance_date, attendance_time, method
        FROM attendance WHERE student_id = $1 ORDER BY recorded_at DESC, id`, [body.id.trim()]);
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
      if (!await organizerForRequest(request)) return send(401, { error: 'Your organizer session expired. Log in again.' });
      const client = await pool.connect();
      try { return send(200, await provisionRoster(client, body.students)); }
      finally { client.release(); }
    }
    if (request.method !== 'POST' || request.url !== '/sync') return send(404, { error: 'Not found.' });
    if (!await organizerForRequest(request)) return send(401, { error: 'Your organizer session expired. Log in again.' });
    validateBatch(body);
    const client = await pool.connect();
    try { return send(200, await saveBatch(client, body)); }
    finally { client.release(); }
  } catch (error) {
    if (error instanceof SyntaxError || /Invalid|Missing|too large|credentials|Import between|Duplicate|email|row/i.test(error.message)) send(400, { error: error.message });
    else { console.error(error); send(500, { error: 'Sync failed. Local records are unchanged.' }); }
  }
});
server.listen(Number(PORT), '0.0.0.0', () => console.log(`NORWEScan API listening on ${PORT}`));
