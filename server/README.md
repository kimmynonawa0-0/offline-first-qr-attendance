# NORWEScan sync API

This Node API stores faculty roster profiles, events, and attendance in PostgreSQL.
It accepts uploads from an organizer whose ID and password match the server settings.
It does not yet provide student login or downloads to other devices.

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

Set `EXPO_PUBLIC_API_URL` in `mobile/.env.local` to a reachable address, for
example `http://192.168.1.10:3000` on a trusted local Wi-Fi network, then
restart Expo. Enter the server organizer password when tapping **Sync to server**.
For deployment, put the API behind HTTPS and configure `DATABASE_URL` with a
managed PostgreSQL instance. Never put database credentials in the mobile app.

Uploads are transactional and idempotent. A record with the same event and
student as an existing record is reported as a conflict and stays pending on
the device. Existing student profiles and event rows are not overwritten by
later uploads. Deleting an event locally does not delete its remote history.

This is a working sync foundation, not a production account system: student
accounts cannot yet sign in on a second device, the server does not issue
sessions or provide downloads, and the mobile app still keeps local plaintext
passwords for offline login. A production deployment needs secure student
provisioning, credential migration, device sessions, rate limiting, and a
trusted TLS endpoint.
