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
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Sync batch must be an object.');
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
    const timeInAt = record.timeInAt || record.recordedAt;
    if (typeof timeInAt !== 'string' || Number.isNaN(Date.parse(timeInAt))) throw new Error('Invalid Time In timestamp.');
    if (record.timeOutAt !== undefined && record.timeOutAt !== null
      && (typeof record.timeOutAt !== 'string' || Number.isNaN(Date.parse(record.timeOutAt)))) throw new Error('Invalid Time Out timestamp.');
    if (record.timeOutAt && !timeInAt) throw new Error('Time Out requires a Time In.');
    for (const method of [record.timeInMethod || record.method || 'scan', record.timeOutMethod]) {
      if (method !== undefined && method !== null && !['scan', 'organizer'].includes(method)) throw new Error('Invalid attendance method.');
    }
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
      const timeInAt = record.timeInAt || record.recordedAt;
      const timeInMethod = record.timeInMethod || record.method || 'scan';
      const saved = await client.query(`INSERT INTO attendance
          (id, student_id, student_name, event_id, event_name, location, recorded_at, attendance_date,
           attendance_time, method, time_in_at, time_in_method, time_out_at, time_out_method)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (event_id, student_id) DO UPDATE SET
          time_out_at = COALESCE(EXCLUDED.time_out_at, attendance.time_out_at),
          time_out_method = COALESCE(EXCLUDED.time_out_method, attendance.time_out_method)
        WHERE attendance.id = EXCLUDED.id AND attendance.time_in_at = EXCLUDED.time_in_at
          AND (EXCLUDED.time_out_at IS NULL OR attendance.time_out_at IS NULL OR attendance.time_out_at = EXCLUDED.time_out_at)
        RETURNING id`,
      [record.id, record.studentId, record.studentName, record.eventId, record.event || '', record.location || '',
        timeInAt, record.date || null, record.timeIn || record.time || null, timeInMethod,
        timeInAt, timeInMethod, record.timeOutAt || null, record.timeOutMethod || null]);
      if (saved.rows[0]?.id === record.id) acceptedRecordIds.push(record.id);
      else conflictRecordIds.push(record.id);
    }
    await client.query('COMMIT');
    return { acceptedRecordIds, conflictRecordIds };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
