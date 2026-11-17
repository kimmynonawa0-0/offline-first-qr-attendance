import { scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { organizerSectionAssigneeIds } from './auth.mjs';
import { normalizeEvent, normalizeEventTime } from './event-schedule.mjs';

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
    const normalized = normalizeEvent(event);
    if (!event || !['id', 'name', 'location', 'date'].every(key => typeof normalized[key] === 'string' && normalized[key].trim())) throw new Error('Invalid event.');
    const explicitEnd = event.end ?? event.endTime;
    if (explicitEnd !== undefined && explicitEnd !== null && explicitEnd !== '' && !normalizeEventTime(explicitEnd)) {
      throw new Error('Invalid event end time.');
    }
    if (!normalized.time || !normalized.end || normalized.end <= normalized.time) throw new Error('Invalid event schedule.');
    if (event.createdLocally !== undefined && typeof event.createdLocally !== 'boolean') throw new Error('Invalid event sync status.');
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

function uniqueById(items) {
  return [...new Map(items.map(item => [item.id, item])).values()];
}

function recordPair(record) {
  return `${record.eventId}\u0000${record.studentId}`;
}

// Two organizers can scan the same student offline. Keep one row per event/student
// by merging the earliest Time In and the earliest Time Out before the bulk upsert.
export function dedupeAttendanceRecords(records) {
  const groups = new Map();
  for (const record of records) {
    const key = recordPair(record);
    groups.set(key, [...(groups.get(key) || []), record]);
  }
  const merged = [];
  for (const group of groups.values()) {
    const ordered = [...group].sort((left, right) =>
      String(left.timeInAt || left.recordedAt || '').localeCompare(String(right.timeInAt || right.recordedAt || '')));
    const base = ordered[0];
    const timeOutAt = group.map(record => record.timeOutAt).filter(Boolean).sort()[0] || null;
    const timeOutRecord = group.find(record => record.timeOutAt && record.timeOutAt === timeOutAt);
    merged.push({
      ...base,
      timeInAt: base.timeInAt || base.recordedAt,
      timeInMethod: base.timeInMethod || base.method || 'scan',
      timeOutAt,
      timeOutMethod: timeOutRecord?.timeOutMethod || base.timeOutMethod || null,
    });
  }
  return merged;
}

async function insertEventOrganizers(client, eventIds, organizerIds) {
  if (!eventIds.length || !organizerIds.length) return;
  const pairs = eventIds.flatMap(eventId => organizerIds.map(organizerId => [eventId, organizerId]));
  await client.query(`INSERT INTO event_organizers (event_id, organizer_id)
    SELECT * FROM UNNEST($1::text[], $2::text[]) ON CONFLICT DO NOTHING`,
  [pairs.map(pair => pair[0]), pairs.map(pair => pair[1])]);
}

export async function saveBatch(client, body, organizer) {
  const account = typeof organizer === 'string' ? { id: organizer } : organizer;
  const organizerId = account.id;
  const acceptedEventIds = [];
  await client.query('BEGIN');
  try {
    const sectionOrganizers = account.section && body.events.some(event => event.createdLocally)
      ? await client.query(`SELECT id, section, access_level, enabled FROM organizers
        WHERE enabled = TRUE AND access_level = 'organizer' AND section = $1`, [account.section])
      : { rows: [] };
    const organizerIds = organizerSectionAssigneeIds(account, sectionOrganizers.rows) || [organizerId];

    const students = uniqueById(body.students);
    if (students.length) {
      await client.query(`INSERT INTO students (id, name, section, email)
        SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[])
        ON CONFLICT (id) DO NOTHING`,
      [students.map(item => item.id), students.map(item => item.name), students.map(item => item.section), students.map(item => item.email || '')]);
    }

    const events = uniqueById(body.events.map(event => normalizeEvent(event)));
    const localEvents = events.filter(event => event.createdLocally);
    const remoteEvents = events.filter(event => !event.createdLocally);
    if (remoteEvents.length) {
      await client.query(`INSERT INTO events (id, name, location, date, time, end_time)
        SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[])
        ON CONFLICT (id) DO NOTHING`,
      [remoteEvents.map(item => item.id), remoteEvents.map(item => item.name), remoteEvents.map(item => item.location),
        remoteEvents.map(item => item.date), remoteEvents.map(item => item.time), remoteEvents.map(item => item.end)]);
    }
    if (localEvents.length) {
      const inserted = await client.query(`INSERT INTO events (id, name, location, date, time, end_time, created_by)
        SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[])
        ON CONFLICT (id) DO NOTHING RETURNING id`,
      [localEvents.map(item => item.id), localEvents.map(item => item.name), localEvents.map(item => item.location),
        localEvents.map(item => item.date), localEvents.map(item => item.time), localEvents.map(item => item.end),
        localEvents.map(() => organizerId)]);
      const insertedIds = inserted.rows.map(row => row.id);
      await insertEventOrganizers(client, insertedIds, organizerIds);
      const existingIds = localEvents.filter(event => !insertedIds.includes(event.id)).map(event => event.id);
      if (existingIds.length) {
        const assigned = await client.query(`SELECT event_id FROM event_organizers
          WHERE organizer_id = $1 AND event_id = ANY($2::text[])`, [organizerId, existingIds]);
        const assignedIds = new Set(assigned.rows.map(row => row.event_id));
        if (existingIds.some(id => !assignedIds.has(id))) throw new Error('A locally created event ID is already in use.');
      }
      acceptedEventIds.push(...localEvents.map(event => event.id));
    }

    const records = dedupeAttendanceRecords(body.records);
    if (records.length) {
      await client.query(`INSERT INTO attendance
          (id, student_id, student_name, event_id, event_name, location, recorded_at, attendance_date,
           attendance_time, method, time_in_at, time_in_method, time_out_at, time_out_method)
        SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[],
          $8::text[], $9::text[], $10::text[], $11::text[], $12::text[], $13::text[], $14::text[])
        ON CONFLICT (event_id, student_id) DO UPDATE SET
          recorded_at = LEAST(attendance.recorded_at, EXCLUDED.recorded_at),
          attendance_date = CASE WHEN EXCLUDED.time_in_at < attendance.time_in_at THEN EXCLUDED.attendance_date ELSE attendance.attendance_date END,
          attendance_time = CASE WHEN EXCLUDED.time_in_at < attendance.time_in_at THEN EXCLUDED.attendance_time ELSE attendance.attendance_time END,
          method = CASE WHEN EXCLUDED.time_in_at < attendance.time_in_at THEN EXCLUDED.method ELSE attendance.method END,
          time_in_at = LEAST(attendance.time_in_at, EXCLUDED.time_in_at),
          time_in_method = CASE WHEN EXCLUDED.time_in_at < attendance.time_in_at THEN EXCLUDED.time_in_method ELSE attendance.time_in_method END,
          time_out_at = CASE
            WHEN attendance.time_out_at IS NULL THEN EXCLUDED.time_out_at
            WHEN EXCLUDED.time_out_at IS NULL THEN attendance.time_out_at
            ELSE LEAST(attendance.time_out_at, EXCLUDED.time_out_at) END,
          time_out_method = CASE
            WHEN attendance.time_out_at IS NULL THEN EXCLUDED.time_out_method
            WHEN EXCLUDED.time_out_at IS NULL THEN attendance.time_out_method
            WHEN EXCLUDED.time_out_at < attendance.time_out_at THEN EXCLUDED.time_out_method
            ELSE attendance.time_out_method END`,
      [records.map(record => record.id), records.map(record => record.studentId), records.map(record => record.studentName),
        records.map(record => record.eventId), records.map(record => record.event || ''),
        records.map(record => record.location || ''), records.map(record => record.timeInAt || record.recordedAt),
        records.map(record => record.date || null), records.map(record => record.timeIn || record.time || null),
        records.map(record => record.timeInMethod || record.method || 'scan'),
        records.map(record => record.timeInAt || record.recordedAt),
        records.map(record => record.timeInMethod || record.method || 'scan'),
        records.map(record => record.timeOutAt || null), records.map(record => record.timeOutMethod || null)]);
    }

    await client.query('COMMIT');
    return {
      acceptedRecordIds: [...new Set(body.records.map(record => record.id))],
      conflictRecordIds: [],
      acceptedEventIds,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
