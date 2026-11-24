# EdgeSync — Sync Protocol

The complete reconciliation contract between edge devices and the central server.
**Read this before touching `mobile/src/remote-sync.mjs`, `server/src/sync.mjs`, or the
`/sync` route.**

## 1. Record lifecycle

```
                scan / organizer check-in
                         │
                         ▼
                 ┌───────────────┐   sync accepted   ┌───────────────┐
                 │ synced: false │ ─────────────────▶│ synced: true  │
                 │  (pending)    │                    │  (reconciled) │
                 └───────────────┘                    └───────────────┘
                         │                                    ▲
                    time-out scan                     refresh merge
                   (stays pending)                (server rows marked
                                                      synced: true)
```

- `synced: false` = outbox entry, safe to retry.
- `synced: true` = server acknowledged; never deleted locally.
- `conflictRecordIds` is reserved by the protocol; the server currently always returns `[]`
  because the upsert converges every conflict automatically.

## 2. Local record shape (mobile `records[]`)

```jsonc
{
  "id": "uuid",                 // unique per record, generated at scan time
  "studentId": "23-02330",
  "studentName": "Juan Dela Cruz",
  "eventId": "uuid",
  "event": "Tech Symposium 2026",
  "location": "Gymnasium",
  "recordedAt": "2026-11-19T08:00:00.000Z",
  "date": "2026-11-19",         // local calendar date
  "time": "8:00 AM",            // display string
  "timeIn": "8:00 AM",
  "timeInAt": "2026-11-19T08:00:00.000Z",
  "timeInMethod": "scan",       // "scan" | "organizer"
  "timeOut": "",
  "timeOutAt": null,
  "timeOutMethod": null,
  "status": "PRESENT",
  "method": "scan",
  "synced": false
}
```

Time-in and time-out share one record (one row per event/student on the server too).

## 3. Client pre-merge (`mergePendingRecords`)

Before upload, pending records are grouped by the pair key
`` `${eventId}\u0000${studentId}` `` and collapsed to **one record per pair**:

- **time-in**: earliest `timeInAt`/`recordedAt` in the group wins.
- **time-out**: earliest `timeOutAt` in the group wins; its `timeOut`/`timeOutMethod` come from
  the record that carries that earliest time-out.
- All original record IDs are preserved and appended to `acceptedRecordIds` on success.

This mirrors the server-side dedupe so both sides agree on what a batch means.

## 4. Wire contract — `POST /sync`

Authorization: `Bearer <session token>` (organizer session, token stored server-side as SHA-256).

Request body:

```jsonc
{
  "students": [ { "id", "name", "section", "email" } ],   // only students referenced by pending records
  "events":   [ { /* event fields, attendees stripped */,
                  "end": "17:00",                          // normalized end time
                  "createdLocally": true } ],              // true = created offline on device
  "records":  [ { /* record shape above */ } ]
}
```

Batch limits (rejected with 400 if exceeded): students ≤ 5000, events ≤ 1000, records ≤ 10000.

Response:

```jsonc
{
  "acceptedRecordIds": ["uuid", ...],   // every record ID in the batch (protocol includes all)
  "conflictRecordIds": [],              // reserved — currently always empty
  "acceptedEventIds":   ["uuid", ...]   // locally-created events the server saved
}
```

## 5. Server pipeline (`saveBatch`)

All inside one transaction (`BEGIN` … `COMMIT`, rollback on any error):

1. **Validate** (`validateBatch`) — batch shape, field types, timestamps parseable,
   `timeOutAt` requires `timeInAt`, methods ∈ {`scan`, `organizer`}.
2. **Students** — `INSERT … ON CONFLICT (id) DO NOTHING` (existing accounts keep credentials).
3. **Events** —
   - Remote events (`createdLocally: false`): `ON CONFLICT (id) DO NOTHING`.
   - Local events (`createdLocally: true`): inserted with `created_by = organizer`;
     the organizer (and all active organizers) are linked in `event_organizers`.
     If the event ID already exists but is **not** assigned to this organizer, the batch fails.
4. **Records** — `dedupeAttendanceRecords` (same pair-merge as the client), then one bulk
   upsert on `UNIQUE (event_id, student_id)`:

```sql
INSERT INTO attendance (…, time_in_at, time_out_at, …)
VALUES …
ON CONFLICT (event_id, student_id) DO UPDATE SET
  recorded_at = LEAST(attendance.recorded_at, EXCLUDED.recorded_at),
  time_in_at  = LEAST(attendance.time_in_at,  EXCLUDED.time_in_at),
  -- time_in_method follows the earliest time_in_at
  time_out_at = CASE
    WHEN attendance.time_out_at IS NULL THEN EXCLUDED.time_out_at
    WHEN EXCLUDED.time_out_at IS NULL THEN attendance.time_out_at
    ELSE LEAST(attendance.time_out_at, EXCLUDED.time_out_at) END,
  -- time_out_method follows the earliest time_out_at
```

## 6. Conflict resolution rules (canonical)

| Field | Rule |
| :--- | :--- |
| `time_in_at` / `recorded_at` | **Earliest wins** (LEAST). The first observed time-in is truth. |
| `time_in_method` | Follows whichever side supplied the earliest time-in. |
| `time_out_at` | Earliest non-null wins; a non-null value never regresses to null. |
| `time_out_method` | Follows whichever side supplied the earliest time-out. |
| Student/event profiles | First write wins (`DO NOTHING`); profiles are refreshed via bootstrap, not sync. |
| Locally-created event IDs | Server-inserted once; collision with an event owned by another organizer is a hard error (no silent takeover). |

This is a deterministic last-writer-wins variant: because comparisons are `LEAST()` on ISO-8601
timestamps, replays and multi-device batches converge to the same row regardless of order.

## 7. Idempotency & retries

- Re-sending the same batch is safe: the upsert converges; `acceptedRecordIds` makes the client
  mark the same records synced again (no-op).
- Network errors and 5xx are `retryable` — the client keeps `synced: false` and can retry later.
- 401 means the session expired/revoked — the client keeps pending data and requires an online
  sign-in before the next attempt.
- 400 means the batch itself is invalid — retrying unchanged will fail again; surface the error.

## 8. Client acceptance (`markSynced`)

Only the server's IDs flip state:

- `acceptedRecordIds` → `synced: true` on matching records.
- `acceptedEventIds` → `createdLocally: false`, `assignedToOrganizer: true` on matching events.
- Anything not acknowledged stays pending — the outbox survives a partial server story.

## 9. Edge cases

- **Two organizers scan the same student offline** → both devices carry a pending record for the
  same pair; client merge and server upsert keep earliest time-in/time-out. One row total.
- **Organizer creates an event offline** → event ships with `createdLocally: true`, gets a real
  server row + `event_organizers` links on first sync; accepted on the reply.
- **Time-out before time-in syncs** → both timestamps travel in the same record; server requires
  `timeOutAt` to have a `timeInAt` (same record) — ordering is preserved by the client merge.
- **Server row newer than local pending record** → local `synced: false` data is merged over the
  remote row on refresh (`mergeUnsyncedRecord`), then re-synced; the upsert's LEAST rules resolve
  the remainder.
