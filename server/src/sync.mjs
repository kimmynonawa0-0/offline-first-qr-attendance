import { scrypt, scryptSync, timingSafeEqual } from 'node:crypto';

export function passwordHash(password, salt) {
  return scryptSync(password, salt, 64).toString('hex');
}

export function passwordMatches(password, salt, expected) {
  const actual = Buffer.from(passwordHash(password, salt), 'hex');
  const stored = Buffer.from(expected, 'hex');
  return actual.length === stored.length && timingSafeEqual(actual, stored);
}

export function passwordHashAsync(password, salt) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (error, key) => {
      if (error) reject(error);
      else resolve(key.toString('hex'));
    });
  });
}

export async function passwordMatchesAsync(password, salt, expected) {
  const actual = Buffer.from(await passwordHashAsync(password, salt), 'hex');
  const stored = Buffer.from(expected, 'hex');
  return actual.length === stored.length && timingSafeEqual(actual, stored);
}

export function validateBatch(body) {
  if (!body || typeof body.adminId !== 'string' || typeof body.password !== 'string') throw new Error('Organizer credentials are required.');
  for (const key of ['students', 'events', 'records']) if (!Array.isArray(body[key])) throw new Error(`Missing ${key} list.`);
  if (body.students.length > 5000 || body.events.length > 1000 || body.records.length > 10000) throw new Error('Sync batch is too large.');
  for (const student of body.students) {
    if (!student || !['id', 'name', 'section'].every(key => typeof student[key] === 'string' && student[key].trim())) throw new Error('Invalid student profile.');
  }
  for (const event of body.events) {
    if (!event || !['id', 'name', 'location', 'date', 'time'].every(key => typeof event[key] === 'string' && event[key].trim())) throw new Error('Invalid event.');
  }
  for (const record of body.records) {
    if (!record || !['id', 'studentId', 'studentName', 'eventId', 'recordedAt'].every(key => typeof record[key] === 'string' && record[key].trim())) throw new Error('Invalid attendance record.');
  }
}

export async function saveBatch(client, body) {
  const acceptedRecordIds = [];
  const conflictRecordIds = [];
  await client.query('BEGIN');
  try {
    for (const person of body.students) {
      await client.query('INSERT INTO students (id, name, section, email) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
        [person.id, person.name, person.section, person.email || '']);
    }
    for (const event of body.events) {
      await client.query('INSERT INTO events (id, name, location, date, time) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
        [event.id, event.name, event.location, event.date, event.time]);
    }
    for (const record of body.records) {
      await client.query(`INSERT INTO attendance (id, student_id, student_name, event_id, event_name, location, recorded_at, attendance_date, attendance_time, method)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT DO NOTHING`,
      [record.id, record.studentId, record.studentName, record.eventId, record.event || '', record.location || '',
        record.recordedAt, record.date || null, record.time || null, record.method || 'scan']);
      const found = await client.query('SELECT id FROM attendance WHERE event_id = $1 AND student_id = $2', [record.eventId, record.studentId]);
      if (found.rows[0]?.id === record.id) acceptedRecordIds.push(record.id);
      else conflictRecordIds.push(record.id);
    }
    await client.query('COMMIT');
    return { acceptedRecordIds, conflictRecordIds };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
