import http from 'node:http';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { passwordHash, passwordMatches, saveBatch, validateBatch } from './sync.mjs';

const { DATABASE_URL, ADMIN_ID, ADMIN_PASSWORD, PORT = '3000' } = process.env;
if (!DATABASE_URL || !ADMIN_ID || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
  throw new Error('Set DATABASE_URL, ADMIN_ID, and ADMIN_PASSWORD (at least 12 characters).');
}
const pool = new pg.Pool({ connectionString: DATABASE_URL });
await pool.query(`CREATE TABLE IF NOT EXISTS organizers (
  id TEXT PRIMARY KEY, salt TEXT NOT NULL, password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, section TEXT NOT NULL, email TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, location TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL, student_name TEXT NOT NULL,
  event_id TEXT NOT NULL, event_name TEXT NOT NULL, location TEXT NOT NULL,
  recorded_at TEXT NOT NULL, method TEXT NOT NULL,
  UNIQUE (event_id, student_id)
);`);
const salt = randomBytes(16).toString('hex');
await pool.query(`INSERT INTO organizers (id, salt, password_hash) VALUES ($1, $2, $3)
  ON CONFLICT (id) DO UPDATE SET salt = EXCLUDED.salt, password_hash = EXCLUDED.password_hash`,
  [ADMIN_ID, salt, passwordHash(ADMIN_PASSWORD, salt)]);

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
  if (request.method !== 'POST' || request.url !== '/sync') return send(404, { error: 'Not found.' });
  let raw = '';
  try {
    for await (const chunk of request) {
      raw += chunk;
      if (raw.length > 8 * 1024 * 1024) return send(413, { error: 'Sync batch is too large.' });
    }
    const body = JSON.parse(raw);
    validateBatch(body);
    const admin = await pool.query('SELECT salt, password_hash FROM organizers WHERE id = $1', [body.adminId]);
    if (!admin.rows[0] || !passwordMatches(body.password, admin.rows[0].salt, admin.rows[0].password_hash)) {
      return send(401, { error: 'Server organizer ID or password is incorrect.' });
    }
    const client = await pool.connect();
    try { return send(200, await saveBatch(client, body)); }
    finally { client.release(); }
  } catch (error) {
    if (error instanceof SyntaxError || /Invalid|Missing|too large|credentials/.test(error.message)) send(400, { error: error.message });
    else { console.error(error); send(500, { error: 'Sync failed. Local records are unchanged.' }); }
  }
});
server.listen(Number(PORT), '0.0.0.0', () => console.log(`NORWEScan API listening on ${PORT}`));
