import { initialData } from './model.mjs';
import { migrateData, STORAGE_KEY } from './storage.mjs';

const TABLES = ['accounts', 'events', 'attendees', 'records'];

function rowsFor(data) {
  return {
    accounts: [...data.admins.map(a => ({ key: `admin:${a.id}`, value: { ...a, role: 'admin' } })),
      ...data.students.map(a => ({ key: `student:${a.id}`, value: { ...a, role: 'student' } }))],
    events: data.events.map(({ attendees, ...event }) => ({ key: event.id, value: event })),
    attendees: data.events.flatMap(event => event.attendees.map(person => ({ key: JSON.stringify([event.id, person.id]), value: person }))),
    records: data.records.map(record => ({ key: record.id, value: record })),
  };
}

async function readData(db) {
  const [accounts, events, attendees, records] = await Promise.all(TABLES.map(table => db.getAllAsync(`SELECT key, value FROM ${table} ORDER BY position`)));
  const people = accounts.map(row => JSON.parse(row.value));
  const present = new Map(attendees.map(row => [row.key, JSON.parse(row.value)]));
  return {
    version: 2,
    admins: people.filter(person => person.role === 'admin').map(({ role, ...person }) => person),
    students: people.filter(person => person.role === 'student').map(({ role, ...person }) => person),
    events: events.map(row => {
      const event = JSON.parse(row.value);
      return { ...event, attendees: attendees.filter(a => JSON.parse(a.key)[0] === event.id).map(a => present.get(a.key)) };
    }),
    records: records.map(row => JSON.parse(row.value)),
  };
}

async function saveData(db, before, after) {
  const previous = before ? rowsFor(before) : Object.fromEntries(TABLES.map(table => [table, []]));
  const next = rowsFor(after);
  await db.withExclusiveTransactionAsync(async tx => {
    for (const table of TABLES) {
      const oldRows = new Map(previous[table].map((row, position) => [row.key, { json: JSON.stringify(row.value), position }]));
      const newKeys = new Set(next[table].map(row => row.key));
      for (const row of previous[table]) {
        if (!newKeys.has(row.key)) await tx.runAsync(`DELETE FROM ${table} WHERE key = ?`, row.key);
      }
      for (const [position, row] of next[table].entries()) {
        const json = JSON.stringify(row.value);
        const old = oldRows.get(row.key);
        if (!old || old.json !== json || old.position !== position) {
          await tx.runAsync(`INSERT INTO ${table} (key, value, position) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, position = excluded.position`, row.key, json, position);
        }
      }
    }
    await tx.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES ('initialized', '1')");
  });
}

export function createSqliteRepository(openDatabase, legacyStorage) {
  let db;
  let current;
  let queue = Promise.resolve();
  async function database() {
    if (!db) {
      db = await openDatabase('norwescan.db');
      await db.execAsync(`PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS accounts (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, position INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS events (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, position INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS attendees (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, position INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, position INTEGER NOT NULL);`);
    }
    return db;
  }
  return {
    async load() {
      const connection = await database();
      const initialized = await connection.getFirstAsync("SELECT value FROM meta WHERE key = 'initialized'");
      if (!initialized) {
        const raw = await legacyStorage.getItem(STORAGE_KEY);
        const data = raw === null ? initialData() : migrateData(JSON.parse(raw));
        await saveData(connection, null, data);
        current = data;
      } else {
        const saved = await readData(connection);
        current = migrateData(saved);
        if (current !== saved) await saveData(connection, saved, current);
      }
      return current;
    },
    update(transform) {
      const operation = queue.then(async () => {
        if (!current) throw new Error('Local database is not ready.');
        const next = transform(current);
        await saveData(await database(), current, next);
        current = next;
        return next;
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}
