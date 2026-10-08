# NORWEScan sync API

This Node API stores faculty roster profiles, events, and attendance in PostgreSQL.
It accepts authenticated roster uploads, verifies student login, and saves student
passwords as salted hashes. The mobile app still keeps an encrypted-in-transit,
local SQLite copy for offline use; the API is the shared source for new logins.
Students can request their own synced attendance history using their ID and
password. The response is limited to records matching that student ID.

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
ADMIN_PASSWORD=your-long-private-server-password
PORT=3000
```

For PowerShell, use `$env:DATABASE_URL='...'` (and likewise for the other values)
in the terminal running the server. A `.env` file is not loaded automatically.
The server creates its tables and seeds the organizer password on first startup.
`GET /health` checks database connectivity. For an existing deployment, set
`ADMIN_PASSWORD` to a private password of at least 12 characters, then use that
same password for the organizer's regular mobile login. The first successful
organizer login aligns the stored credential once; later password changes are
saved in PostgreSQL and are not reset on restart. If the local organizer has
not completed the first-login password change yet, local login still works,
but remote uploads remain unavailable until the passwords match.

Set `EXPO_PUBLIC_API_URL` in `mobile/.env.local` to the API address, then restart
Expo. For LAN testing, use the computer's reachable local IP and trusted Wi-Fi.
For testing across different networks, deploy this API behind HTTPS and point it
at a managed PostgreSQL database. The database URL and organizer password stay
on the server and must never be placed in the mobile app.

The organizer signs in through the regular student-ID/password page. On online
login, the API returns a random session token; the app stores it with Expo
SecureStore and sends it automatically for roster uploads and sync. The token
does not expire automatically: logging out revokes it, and changing the admin
password revokes prior sessions while issuing a replacement for the current
device. A logout while offline clears the local token, but the server cannot
receive the revocation until the device is online again.
Roster uploads create student records with salted hashes of each student's
section as their temporary password. Existing student credentials and profiles
are preserved. Students must have internet for
their first server login and password change; after login, the app caches their
account in local SQLite so they can sign in offline on that device.

Uploads are transactional and idempotent. A record with the same event and
student as an existing record is reported as a conflict and stays pending on
the device. Existing student profiles and event rows are not overwritten by
later uploads. Deleting an event locally does not delete its remote history.
Students can refresh records from `/student/attendance`; returned attendance is
cached on their device for offline viewing. The server stores each scan's
original date and time for history display.

This is a prototype account system. Student passwords remain in local SQLite
for offline login, so treat those devices as trusted and use test data only.
Before production, add rate limiting, account recovery, audit logging, and a
reviewed HTTPS deployment.
