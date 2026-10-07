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
  let added = 0;
  let skipped = 0;
  await client.query('BEGIN');
  try {
    for (const [index, student] of rows.entries()) {
      const existing = await client.query('SELECT password_hash FROM students WHERE id = $1', [student.id]);
      const { salt, hash } = credentials[index];
      if (!existing.rows[0]) {
        await client.query(`INSERT INTO students (id, name, section, email, password_salt, password_hash, must_change_password)
          VALUES ($1, $2, $3, $4, $5, $6, TRUE)`, [student.id, student.name, student.section, student.email, salt, hash]);
        added++;
      } else {
        await client.query(`UPDATE students SET password_salt = $2, password_hash = $3, must_change_password = TRUE
          WHERE id = $1 AND password_hash IS NULL`, [student.id, salt, hash]);
        skipped++;
      }
    }
    await client.query('COMMIT');
    return { added, skipped };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
