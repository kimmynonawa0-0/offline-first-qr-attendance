# NORWEScan sync API

The Render Node service serves both the manager website (`/manager`) and the API.
Neon PostgreSQL is the shared source for rosters, organizer access, events, and
synced attendance. Organizer phones keep a local SQLite roster and assigned event
copies so attendance can still be scanned offline.

## Local setup

Install Node.js 22+ and PostgreSQL 17. Docker Compose can start PostgreSQL:

```sh
docker compose up -d
npm ci
```

Set these environment variables before `npm start`:

```text
DATABASE_URL=postgres://norwescan:norwescan@localhost:5434/norwescan
ADMIN_ID=23-02330
ADMIN_PASSWORD=your-long-private-organizer-password
MANAGER_ID=99-00001
MANAGER_PASSWORD=a-different-long-private-manager-password
PORT=3000
```

For PowerShell, use `$env:DATABASE_URL='...'` (and likewise for the other values)
in the terminal running the server. A `.env` file is not loaded automatically.
The server creates or migrates its tables at startup. Keep the credentials
separate: `ADMIN_ID`/`ADMIN_PASSWORD` seed the legacy organizer app account;
`MANAGER_ID`/`MANAGER_PASSWORD` seed the system-manager website account. The IDs
must differ, the passwords must differ, and both passwords must be at least 12 characters. On Render, set
all four variables before deploying. Open
`https://YOUR-RENDER-SERVICE.onrender.com/manager` and sign in with the manager
ID/password; its first login requires a private password change. System managers
can import CSV/Excel rosters, grant or revoke organizer access, create events,
assign organizers, review attendance, and inspect the audit log. The unified
login endpoint identifies the account role, but website management tools require
the separate manager role.

Set `EXPO_PUBLIC_API_URL` in `mobile/.env.local` to the API address, then restart
Expo. For LAN testing, use the computer's reachable local IP and trusted Wi-Fi.
For testing across different networks, deploy this API behind HTTPS and point it
at a managed PostgreSQL database. The database URL and organizer password stay
on the server and must never be placed in the mobile app.

To make a student an organizer, import that student first, then grant organizer
access by student ID. Their existing password remains the same. The organizer
signs in through the app's unified login. Online login downloads the assigned
events and student roster into local SQLite. The app saves each scan locally;
Sync sends only pending records and the server checks event assignment and
student membership before accepting them. A revoked organizer cannot sign in or
sync; offline scans remain on that phone and cannot be uploaded while access is
revoked. Access removal revokes server sessions immediately. Logout revokes the
server session when the device is online; offline logout clears the local token,
and that server token remains valid until access is revoked.

Roster files are limited to 1 MB and 5,000 students. The server parses the first
CSV/Excel sheet during preview, validates it, then provisions student accounts
transactionally. New students use their section as a temporary password;
existing credentials are preserved. Students need internet for their first
server login and password change, then the app caches their account locally.

Attendance sync is transactional and idempotent. A record with the same event
and student as an existing record is reported as a conflict and stays pending on
the device. The server uses its own event, student, and assignment data when
recording attendance, so edits to the phone's roster cannot create accounts.
Students can refresh records from `/student/attendance`; returned attendance is
cached on their device for offline viewing. The server stores each scan's
original date and time for history display.

The management website runs on the same Render service as the API, so browser
requests use one HTTPS origin. Render Free web services sleep after 15 minutes
of inactivity; the first request afterward can take about a minute. Neon Free
compute also scales to zero when idle. These free tiers suit a small pilot but
cannot guarantee a fast first request. Student passwords remain in local SQLite
for offline login, so use test data and trusted pilot devices.
