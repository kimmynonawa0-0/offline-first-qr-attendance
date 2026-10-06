import test from 'node:test';
import assert from 'node:assert/strict';
import { markSynced, syncToServer } from './remote-sync.mjs';

test('remote sync sends only pending receipts and confirms only accepted IDs', async () => {
  const data = { students: [{ id: '1', name: 'A', section: 'S', password: 'private' }],
    events: [{ id: 'e', name: 'Event', attendees: [{ id: '1' }] }],
    records: [{ id: 'r1', synced: false }, { id: 'r2', synced: true }] };
  let sent;
  const fetchImpl = async (_, options) => {
    sent = JSON.parse(options.body);
    return { ok: true, json: async () => ({ acceptedRecordIds: ['r1'], conflictRecordIds: [] }) };
  };
  const result = await syncToServer(data, { id: '23-02330', role: 'admin' }, 'secret', 'http://localhost:3000/', fetchImpl);
  assert.deepEqual(sent.records.map(r => r.id), ['r1']);
  assert.equal(sent.students[0].password, undefined);
  assert.equal(sent.events[0].attendees, undefined);
  assert.deepEqual(markSynced(data, result.acceptedRecordIds).records.map(r => r.synced), [true, true]);
  assert.equal(data.records[0].synced, false);
});

test('failed server response leaves local data untouched', async () => {
  const data = { students: [], events: [], records: [{ id: 'r1', synced: false }] };
  await assert.rejects(syncToServer(data, { id: 'a', role: 'admin' }, 'secret', 'http://localhost:3000',
    async () => ({ ok: false, json: async () => ({ error: 'Wrong password.' }) })), /Wrong password/);
  assert.equal(data.records[0].synced, false);
});
