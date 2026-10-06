import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createSqliteRepository } from './sqlite-storage.mjs';
import { initialData, changePassword, login } from './model.mjs';
import { STORAGE_KEY } from './storage.mjs';

function openMemory() {
  const native = new DatabaseSync(':memory:');
  const wrap = {
    execAsync: async sql => native.exec(sql),
    getAllAsync: async (sql, ...args) => native.prepare(sql).all(...args),
    getFirstAsync: async (sql, ...args) => native.prepare(sql).get(...args),
    runAsync: async (sql, ...args) => native.prepare(sql).run(...args),
    withExclusiveTransactionAsync: async task => {
      native.exec('BEGIN IMMEDIATE');
      try { await task(wrap); native.exec('COMMIT'); }
      catch (error) { native.exec('ROLLBACK'); throw error; }
    },
  };
  return wrap;
}

test('SQLite migrates an old snapshot once and preserves account changes and receipts', async () => {
  const db = openMemory();
  const old = initialData();
  old.records.push({ id: 'r1', studentId: '23-02330', eventId: 'e1', synced: false });
  old.events.push({ id: 'e1', name: 'Assembly', location: 'Hall', date: '2026-10-06', time: '09:00', attendees: [{ id: '23-02330', name: 'Demo Organizer', time: '09:00', method: 'organizer' }] });
  let raw = JSON.stringify(old);
  const legacy = { getItem: async key => key === STORAGE_KEY ? raw : null };
  const repo = createSqliteRepository(async () => db, legacy);
  assert.equal((await repo.load()).events[0].attendees.length, 1);
  await repo.update(data => changePassword(data, login(data, '23-02330', 'BSCS-3C'), 'my-long-new-password', 'my-long-new-password'));
  raw = '{corrupted after migration';
  const reloaded = await createSqliteRepository(async () => db, legacy).load();
  assert.equal(login(reloaded, '23-02330', 'my-long-new-password').mustChangePassword, false);
  assert.equal(reloaded.records[0].id, 'r1');
  assert.equal(reloaded.events[0].attendees[0].id, '23-02330');
});

test('SQLite rolls back failed updates and keeps legacy data when migration fails', async () => {
  const db = openMemory();
  const legacy = { getItem: async () => JSON.stringify(initialData()) };
  const repo = createSqliteRepository(async () => db, legacy);
  await repo.load();
  await assert.rejects(repo.update(data => ({ ...data, records: [{ id: null }] })), /NOT NULL/);
  assert.equal((await createSqliteRepository(async () => db, legacy).load()).records.length, 0);
  const bad = openMemory();
  await assert.rejects(createSqliteRepository(async () => bad, { getItem: async () => '{bad' }).load());
  assert.equal(await bad.getFirstAsync("SELECT value FROM meta WHERE key = 'initialized'"), undefined);
});
