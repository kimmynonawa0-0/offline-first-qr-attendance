# NORWEScan sync API

The Render Node service serves the system-manager console at `/manager` and the
attendance API. It does not serve a separate organizer website.
Neon PostgreSQL is the shared source for rosters, organizer access, events, and
synced attendance. Organizer phones keep a local SQLite roster and assigned event
copies so attendance can still be scanned offline.

## Manager console build

The `/manager` page is a React application. Source lives in `manager/` and the
server serves the esbuild bundle embedded in `public/manager.html`. After editing
the React source, rebuild it with:

```sh
npm run build:manager
```

`react`, `react-dom`, and `esbuild` are development dependencies; the running
server only reads the generated HTML file. The console no longer reloads the page
for normal roster, student, organizer, event, attendance, or account actions.

## Schema notes

The server updates its schema at startup and records one-time repairs in
`schema_migrations`. Recent migrations add event `end_time`, backfill the end time
for existing events, and backfill usable student accounts for organizers that were
revoked under the old flow.

`students` and `organizers` intentionally keep separate credential columns so
mobile students and the manager console can authenticate independently. Revoke
and grant operations synchronize those credentials, and both session tables are
cleared so the next login resolves the current role. Attendance rows keep student
name, event name, and location snapshots for historical accuracy; they are not
foreign-keyed to live accounts so historical records survive roster deletion.

Indexes cover the hot paths: event date/time, event-organizer assignment,
attendance event/student and recorded-at reads, roster section/name filtering,
session revocation by account, active organizer filtering, and recent audit
history.

## Local setup

Install Node.js 22+ and PostgreSQL 17. Docker Compose can start PostgreSQL:

```sh
docker compose up -d
npm ci
```

Set these environment variables before `npm start`:

```text
DATABASE_URL=postgres://<db-user>:<db-password>@localhost:5434/<db-name>
ADMIN_ID=<your-organizer-account-id>
ADMIN_PASSWORD=<unique-private-password>
MANAGER_USERNAME=<your-private-manager-username>
MANAGER_PASSWORD=<different-unique-private-password>
PORT=3000
```

For PowerShell, use `$env:DATABASE_URL='...'` (and likewise for the other values)
in the terminal running the server. A `.env` file is not loaded automatically.
These are placeholders, not working credentials. Use private values that are
unique to your deployment, and never commit them or paste them into documentation,
source control, screenshots, or the mobile app. The server creates or migrates its tables at startup. Keep the credentials
separate: `ADMIN_ID`/`ADMIN_PASSWORD` seed the legacy organizer app account;
`MANAGER_USERNAME`/`MANAGER_PASSWORD` seed the system-manager website account.
The username must differ from the organizer ID, and both passwords must be at
least 12 characters. The manager password may be the same password used for a
previous account; stored password hashes cannot be read or copied automatically.
Set `MANAGER_PASSWORD` to the password you want to keep. On Render, set all five
variables through the service's private environment settings before deploying.
Open `https://<your-api-host>/manager` and sign in with the manager
username/password; its first login requires a private password change. System managers
can import CSV/Excel rosters, manage student profiles, reset student passwords,
grant or revoke organizer access, create events, assign organizers, review all
attendance, and inspect the audit log. A system manager can also delete an
event that already has check-ins after re-entering the manager password; this
force deletion removes the event and its attendance records. The student
directory groups sections by
program and year. New students and password resets use the section as a temporary
password and require a password change. Deleting a student revokes their organizer
access but preserves historical attendance. Revoking organizer access removes the
account from the active organizer list and keeps the same credentials on its
student account, so the next login opens the student app with inherited
attendance. An organizer without a complete name and section profile (for
example, a legacy or seeded account) is not copied into the student roster
when revoked, and incomplete student rows are excluded from the organizer
roster download, so one malformed account can never block organizer sign-in;
the manager console still lists those rows for editing or deletion. Granting access again from the student picker restores the organizer
role with the current student password. An event created by an organizer is
automatically assigned to every active organizer across all sections, including
events created offline and uploaded later. Every event has a start and end time:
scans inside the window record Time In, and scans after the end time record Time
Out. Event organizers use the PWA/mobile
app to view and import rosters from any section, scan assigned events, and review
check-ins; they cannot use the system-manager console. Manager APIs enforce this
role boundary even if an organizer opens `/manager` directly.

System managers can change their password from **Account** while signed in. On
that page, choose **Create recovery code** and store the one-time code in a
private offline location. It is displayed only once; creating another code
replaces the previous one. If locked out, choose **Forgot password?** on
`/manager` and use the manager username and saved code to reset the password. A
successful reset consumes the code and revokes existing manager sessions. If
the code is lost, sign in and create a new one; there is no email recovery.

If the recovery code is also lost, a developer with database access can restore
the manager account from a trusted machine using the `MANAGER_PASSWORD` value
already configured for the service:

```sh
cd server
$env:DATABASE_URL='<external database URL>'
$env:MANAGER_USERNAME='<manager username>'
$env:MANAGER_PASSWORD='<configured manager password>'
npm run reset-manager-password -- --confirm
```

The script requires `--confirm`, revokes manager sessions, clears any saved
recovery code, and requires a password change at the next sign-in. Change the
password and create a new recovery code immediately after recovering access.
Redeploying the service does not reset a changed manager password; only this
explicit script does.

Set `EXPO_PUBLIC_API_URL` in `mobile/.env.local` to the API address, then restart
Expo. For LAN testing, use the computer's reachable local IP and trusted Wi-Fi.
For testing across different networks, deploy this API behind HTTPS and point it
at a managed PostgreSQL database. The database URL and organizer password stay
on the server and must never be placed in the mobile app.

For a separately hosted PWA, set the Render API environment variable
`WEB_ORIGINS` to the exact HTTPS origin serving the PWA, for example
`https://<your-pwa-host>` (no path or trailing slash). Multiple
origins may be comma-separated. Add local origins explicitly for development,
such as `http://localhost:8081,http://127.0.0.1:4173`; the API does not allow
unconfigured browser origins. It handles JSON preflight requests and permits only
`GET`, `POST`, `DELETE`, and the `Content-Type` and `Authorization` headers used by the
app. This is browser cross-origin configuration, not authentication; API routes
still enforce account and organizer-session authorization.

Organizer access comes only from the imported roster: import the student's
section first, then grant organizer access by searching the student ID in the
manager console. A made-up ID can never become an organizer account. Their
existing password remains the same. The organizer
signs in to the PWA or mobile app with the same credentials. Online app login
downloads the assigned
events and student roster into local SQLite. Organizers can delete an event they
created while it has no check-ins; once the event has any scan, only the system
manager can delete it. The app saves each scan locally;
Sync sends only pending records and the server checks event assignment and
student membership before accepting them. A revoked organizer cannot sign in or
sync; offline scans remain on that phone and cannot be uploaded while access is
revoked. Access removal revokes server sessions immediately. Logout revokes the
server session when the device is online; offline logout clears the local token,
and that server token remains valid until access is revoked.

Roster files are limited to 1 MB and 5,000 students. The server parses the first
CSV/Excel sheet during preview, validates it, then provisions student accounts
transactionally. New students use their section as a temporary password;
existing credentials are preserved. Every student row carries a `created_at`
insertion timestamp, and the students table is re-clustered on boot so physical
storage order matches insertion order; the manager console and database browsers
therefore show newly added students at the bottom (and at the bottom of their
section group when sorted by section). Students need internet for their first
server login and password change, then the app caches their account locally.

Attendance sync is transactional and idempotent. Records with the same event and
student are merged into one row: the earliest Time In and earliest Time Out win,
so two organizers who scanned the same student converge after sync instead of
leaving a stuck pending record. The server uses its own event, student, and
assignment data when recording attendance, so edits to the phone's roster cannot
create accounts. Students can refresh records from `/student/attendance`;
returned attendance is cached on their device for offline viewing. The same
response includes the event feed — every event, regardless of the organizing
section or year level — so a student dashboard can display the current and
upcoming events. The server
stores each scan's original date and time for history display.

The management website runs on the same Render service as the API, so browser
requests use one HTTPS origin. Render Free web services sleep after 15 minutes
of inactivity; the first request afterward can take about a minute. Neon Free
compute also scales to zero when idle. These free tiers suit a small pilot but
cannot guarantee a fast first request. Student passwords remain in local SQLite
for offline login, so use test data and trusted pilot devices.
