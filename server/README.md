# NORWEScan sync API

The Oracle Cloud Always Free Node service serves the system-manager console at `/manager` and the
attendance API. It does not serve a separate organizer website.

PostgreSQL runs in Docker on the same Oracle Cloud host and is the shared source for rosters,
organizer access, events, and synced attendance. Organizer phones keep a local SQLite roster and
assigned event copies so attendance can still be scanned offline.

## Deploy on Oracle Cloud

After the host is prepared, the production deployment is one command. You need:

- A DNS `A` record for `api.example.com` pointing at the Oracle public IP.
- Inbound TCP `80` and `443` allowed in both the OCI VCN security list and the host firewall
  (`ufw`, `firewalld`, or `iptables`, depending on the image).
- Docker Engine with the Compose plugin installed on the VM.

On a fresh Ubuntu VM:

```sh
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker
```

Clone the repository and create the environment file:

```sh
git clone https://github.com/kimmynonawa0-0/offline-first-qr-attendance.git
cd offline-first-qr-attendance
cp server/.env.example server/.env
chmod 600 server/.env
```

Edit `server/.env` and set the credentials and the API hostname, then run the deployment.
`deploy.sh` refuses to start while the placeholder passwords or `API_DOMAIN` remain.
Add the Vercel PWA origin to `WEB_ORIGINS` after the PWA is deployed; until then the API logs a
warning and the browser PWA is blocked by CORS.

```sh
cd server
./deploy.sh
```

If Git did not preserve the executable bit (for example, after copying files from
Windows), run `chmod +x deploy.sh` once.

`deploy.sh` validates `.env`, starts PostgreSQL, the Node API, and Caddy, and waits for the
services to become healthy. Caddy obtains and renews the HTTPS certificate for `API_DOMAIN` and
proxies requests to the API. The production Compose override does not publish the API port on the
host; Caddy is the only public entry point. Local `docker compose up` still publishes port `3000`
for LAN testing.

Verify:

```sh
curl https://api.example.com/health
```

Then open `https://api.example.com/manager`. The first manager login requires a password change.
Rerun `./deploy.sh` after changing `.env` or pulling new code.

If HTTPS does not come up, confirm the DNS `A` record resolves to the VM and that ports `80` and
`443` are open, then inspect Caddy:

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=100 caddy
```

## Local setup

Install Node.js 22+ and Docker.

For local development, from `server/`, Docker Compose starts PostgreSQL and the Node API without
Caddy:

```sh
docker compose up -d --build
```

Set environment variables in `server/.env` before starting the stack. Docker Compose reads variable
substitution from that file and passes the configured values to the server container. The compose file
points the server at the PostgreSQL service internally.

```text
ADMIN_ID=<your-organizer-account-id>
ADMIN_PASSWORD=<unique-private-password>
MANAGER_USERNAME=<your-private-manager-username>
MANAGER_PASSWORD=<different-unique-private-manager-password>
WEB_ORIGINS=<your-vercel-pwa-origin>
API_DOMAIN=api.example.com
```

`API_DOMAIN` is used only by `deploy.sh` and Caddy. It is not needed for local
`docker compose up`.

For running the API without Docker against a separate PostgreSQL instance, start PostgreSQL and set
`DATABASE_URL=postgres://<db-user>:<db-password>@<db-host>:5434/<db-name>`.

For PowerShell, use `$env:DATABASE_URL='...'`, and likewise for the other values, in the terminal
running the server. A `.env` file is not loaded automatically. These are placeholders, not working
credentials. Use private values that are unique to your deployment, and never commit them or paste
them into documentation, source control, screenshots, or the mobile app.

The server creates or migrates its tables at startup. Keep the credentials separate:
`ADMIN_ID`/`ADMIN_PASSWORD` seed the legacy organizer app account;
`MANAGER_USERNAME`/`MANAGER_PASSWORD` seed the system-manager website account. The username must
differ from the organizer ID, and both passwords must be at least 12 characters. The manager password
may be the same password used for a previous account; stored password hashes cannot be read or copied
automatically. Set `MANAGER_PASSWORD` to the password you want to keep.

In production, `deploy.sh` starts the API behind Caddy. Open the management website at
`https://<API_DOMAIN>/manager`; the first manager login requires a private password change.

## System manager operations

Open `https://<your-oracle-api-host>/manager` and sign in with the manager
username/password; its first login requires a private password change. System managers
can import CSV/Excel rosters, manage student profiles, reset student passwords,
grant or revoke organizer access, create events, assign organizers, review all
attendance, and inspect the audit log.

A system manager can also delete an event that already has check-ins after re-entering
the manager password; this force deletion removes the event and its attendance records.

If the recovery code is also lost, run the recovery script inside the server container on the
Oracle host. The container already has `DATABASE_URL`, `MANAGER_USERNAME`, and `MANAGER_PASSWORD`
from Compose:

```sh
cd server
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec server \
  node scripts/reset-manager-password.mjs --confirm
```

The script requires `--confirm`, revokes manager sessions, clears any saved
recovery code, and requires a password change at the next sign-in. Change the
password and create a new recovery code immediately after recovering access.
Redeploying the service does not reset a changed manager password; only this
explicit script does.

## Browser and mobile web origin

Set `EXPO_PUBLIC_API_URL` in `mobile/.env.local` to the API address, then restart
Expo. For LAN testing, use the computer's reachable local IP and trusted Wi-Fi.

For the Vercel-hosted PWA, set `WEB_ORIGINS` in `server/.env` to the exact HTTPS
origin serving the PWA, for example `https://<your-pwa-host>` (no path or trailing
slash). Multiple origins may be comma-separated. Add local origins explicitly for
development, such as `http://localhost:8081,http://127.0.0.1:4173`; the API does
not allow unconfigured browser origins. Rerun `./deploy.sh` after changing it. The
API handles JSON preflight requests and permits only `GET`, `POST`, `DELETE`, and
the `Content-Type` and `Authorization` headers used by the app. This is browser
cross-origin configuration, not authentication; API routes still enforce account
and organizer-session authorization.

## Migrated flows and sync rules

To make a student an organizer, import that student first, then grant organizer
access by student ID. Their existing password remains the same. The organizer
signs in to the PWA or mobile app with the same credentials. Online app login
downloads the assigned events and student roster into local SQLite. Organizers
can delete an event they created while it has no check-ins; once the event has
any scan, only the system manager can delete it. The app saves each scan locally;
sync sends only pending records and the server checks event assignment and
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

The management website runs on the same Oracle Cloud Docker service as the API,
so browser requests use one HTTPS origin. The Oracle Always Free host does not
idle, and the Vercel static PWA is served from Vercel's global CDN, so neither
side introduces the former Render free-tier sleep behavior. Student passwords
remain in local SQLite for offline login, so use test data and trusted pilot
devices.

## Backup

The database lives in the `norwescan_pg` Docker volume. Back it up from the host:

```sh
cd server
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U norwescan -d norwescan | gzip > backup-$(date +%F).sql.gz
```

Do not run `docker compose down -v`; the `-v` flag deletes the database volume
and all roster and attendance data.
