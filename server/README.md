# NORWEScan sync API

This Node API stores faculty roster profiles, events, and attendance in PostgreSQL.
It accepts authenticated roster uploads, verifies student login, and saves student
passwords as salted hashes. The mobile app still keeps an encrypted-in-transit,
local SQLite copy for offline use; the API is the shared source for new logins.

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
The server creates its tables and organizer password hash on startup. `GET /health`
checks database connectivity. The organizer password is reset to the environment
value every time this single-organizer prototype server starts.

Set `EXPO_PUBLIC_API_URL` in `mobile/.env.local` to the API address, then restart
Expo. For LAN testing, use the computer's reachable local IP and trusted Wi-Fi.
For testing across different networks, deploy this API behind HTTPS and point it
at a managed PostgreSQL database. The database URL and organizer password stay
on the server and must never be placed in the mobile app.

When importing a roster, the organizer enters the server organizer password.
The API verifies the organizer and transactionally creates student records with
salted hashes of each student's section as their temporary password. Existing
student credentials and profiles are preserved. Students must have internet for
their first server login and password change; after login, the app caches their
account in local SQLite so they can sign in offline on that device.

Uploads are transactional and idempotent. A record with the same event and
student as an existing record is reported as a conflict and stays pending on
the device. Existing student profiles and event rows are not overwritten by
later uploads. Deleting an event locally does not delete its remote history.

This is a prototype account system. The API verifies passwords on each login
without issuing long-lived sessions. Student passwords remain in local SQLite
for offline login, so treat those devices as trusted and use test data only.
Before production, add rate limiting, managed sessions, secure local credential
storage, account recovery, audit logging, and a reviewed HTTPS deployment.
