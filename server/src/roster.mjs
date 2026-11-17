import { randomBytes } from 'node:crypto';
import { passwordHashAsync } from './sync.mjs';

export function validateRoster(students) {
  if (!Array.isArray(students) || students.length < 1 || students.length > 5000) {
    throw new Error('Import between 1 and 5,000 students at a time.');
  }
  const ids = new Set();
  return students.map((student, index) => {
    if (!student || !['id', 'name', 'section'].every(key => typeof student[key] === 'string' && student[key].trim())) {
      throw new Error(`Invalid student profile at row ${index + 2}.`);
    }
    const row = {
      id: student.id.trim(), name: student.name.trim(), section: student.section.trim(),
      email: typeof student.email === 'string' ? student.email.trim().toLowerCase() : '',
    };
    if (row.id.length > 100 || row.name.length > 200 || row.section.length > 100 || /[\r\n\t]/.test(row.id + row.name + row.section)) {
      throw new Error(`Invalid student profile at row ${index + 2}.`);
    }
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) throw new Error(`Invalid email at row ${index + 2}.`);
    if (ids.has(row.id)) throw new Error(`Duplicate student ID at row ${index + 2}.`);
    ids.add(row.id);
    return row;
  });
}

export async function provisionRoster(client, students) {
  const rows = validateRoster(students);
  const credentials = [];
  for (let start = 0; start < rows.length; start += 16) {
    const batch = rows.slice(start, start + 16);
    credentials.push(...await Promise.all(batch.map(async student => {
      const salt = randomBytes(16).toString('hex');
      return { salt, hash: await passwordHashAsync(student.section, salt) };
    })));
  }
  await client.query('BEGIN');
  try {
    const result = await client.query(`INSERT INTO students
        (id, name, section, email, password_salt, password_hash, must_change_password)
      SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::boolean[])
      ON CONFLICT (id) DO UPDATE SET
        password_salt = COALESCE(students.password_salt, EXCLUDED.password_salt),
        password_hash = COALESCE(students.password_hash, EXCLUDED.password_hash),
        must_change_password = CASE WHEN students.password_hash IS NULL THEN TRUE ELSE students.must_change_password END
      RETURNING (xmax = 0) AS inserted`,
    [rows.map(student => student.id), rows.map(student => student.name), rows.map(student => student.section),
      rows.map(student => student.email), credentials.map(item => item.salt), credentials.map(item => item.hash),
      rows.map(() => true)]);
    await client.query('COMMIT');
    const added = result.rows.filter(row => row.inserted).length;
    return { added, skipped: rows.length - added };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
