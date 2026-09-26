import { DEMO_ADMIN, initialData } from './model.mjs';

export const STORAGE_KEY = 'norwe-scan-mobile-v1';

function ensureDemoAccount(data) {
  // Prototype setup only: never replace an existing password or promote a student.
  if ([...data.admins, ...data.students].some(a => a.id === DEMO_ADMIN.id)) return data;
  return { ...data, admins: [...data.admins, { ...DEMO_ADMIN }] };
}

function migrateDemoId(data) {
  const oldId = 'DEMO-ADMIN';
  if (!data.admins.some(a => a.id === oldId)) return data;
  if ([...data.admins, ...data.students].some(a => a.id === DEMO_ADMIN.id)) {
    throw new Error('The new demo administrator ID already belongs to another account. Saved data has not been changed.');
  }
  return {
    ...data,
    admins: data.admins.map(a => a.id === oldId ? { ...a, id: DEMO_ADMIN.id } : a),
    events: data.events.map(e => ({ ...e, attendees: e.attendees.map(a => a.id === oldId ? { ...a, id: DEMO_ADMIN.id } : a) })),
    records: data.records.map(r => r.studentId === oldId ? { ...r, studentId: DEMO_ADMIN.id } : r),
  };
}

export function migrateData(data) {
  if (!data || ![1, 2].includes(data.version) || !['students', 'admins', 'events', 'records'].every(key => Array.isArray(data[key]))) {
    throw new Error('Saved data cannot be opened. It has not been overwritten.');
  }
  if (data.version === 2) return ensureDemoAccount(migrateDemoId(data));
  // Preserve attendance; the former admin account wins if both roles shared an ID.
  const upgrade = a => ({ ...a, section: a.section || '', mustChangePassword: true });
  const admins = data.admins.map(upgrade);
  const students = data.students.filter(a => !admins.some(admin => admin.id === a.id)).map(upgrade);
  if (!admins.length) {
    if (students.some(a => a.id === DEMO_ADMIN.id)) throw new Error('Demo administrator ID conflicts with a saved account.');
    admins.push({ ...DEMO_ADMIN });
  }
  const ids = [...admins, ...students].map(a => a.id);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate student IDs in saved data.');
  return ensureDemoAccount(migrateDemoId({ ...data, version: 2, admins, students }));
}

export function createRepository(storage) {
  let current = null;
  let queue = Promise.resolve();
  return {
    async load() {
      const raw = await storage.getItem(STORAGE_KEY);
      const saved = raw === null ? null : JSON.parse(raw);
      const data = raw === null ? initialData() : migrateData(saved);
      if (raw === null || saved !== data) await storage.setItem(STORAGE_KEY, JSON.stringify(data));
      current = data;
      return data;
    },
    update(transform) {
      // Commit one complete snapshot before showing success; serialize rapid taps.
      const operation = queue.then(async () => {
        if (!current) throw new Error('Local storage is not ready.');
        const next = transform(current);
        await storage.setItem(STORAGE_KEY, JSON.stringify(next));
        current = next;
        return next;
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}
