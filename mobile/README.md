# NORWE-SCAN mobile prototype

React Native + Expo attendance app with the CCIS yellow and black theme.
The mobile account flow follows the revised faculty-roster design, not the old signup flow.
The browser prototype is retained for comparison. This is a native interface,
not a WebView wrapper.

## Run with Expo Go

Use a current Node.js LTS release (Node 22.13 or newer) and an Expo Go version
compatible with Expo SDK 57.

```sh
cd mobile
npm ci
npx expo start
```

Scan the development QR with Expo Go on Android. Keep your phone and computer
on the same network. To preview in a browser, run `npm run web`.

Both app roles use the same student-ID login. The API determines whether the
account is a student or an event organizer. On the server, `ADMIN_ID` and
`ADMIN_PASSWORD` seed the legacy organizer account; the separate `MANAGER_ID`
and `MANAGER_PASSWORD` seed the system-manager website account. The IDs and
passwords must be distinct, and both passwords must be at least 12 characters.
Open the API URL with `/manager` to import rosters, grant organizer access,
create and assign events, and review synced attendance. The manager changes the
initial password on first website sign-in and uses the website, not the scanner
app.

## Faculty roster

The manager website accepts **CSV UTF-8 (.csv)** and **Excel (.xlsx, .xls)**.
Excel rosters must use the first worksheet and text-formatted Student IDs.

```csv
student_id,name,section,email
2024-00123,Juan Dela Cruz,BSCS-3C,juan@example.com
2024-00124,"Santos, Maria",BSCS-3C,maria@example.com
```

Email is optional. `Student ID` and `Full Name` header spellings also work.
The server validates and previews the file before import. Limits: 1 MB and
5,000 students per file. Invalid rows, duplicate IDs, and missing required
fields reject the entire import. Existing credentials are preserved.

New accounts use the exact section text as their temporary password and must
replace it with a different password of at least 12 characters. Dashboard,
attendance, and import access remain blocked until that change is saved.

Organizer access is granted by the system manager to a student ID already in the
roster. Revoking access blocks new online sign-ins and syncs. Student requests
for organizer access and email password recovery are deferred.

## Migrated flows

- One student-ID login with automatic role selection, password visibility, and logout confirmation.
- System manager website for roster import, organizer access, event assignment, and attendance review.
- Mandatory first-login password change for both roles, persisted across app restarts.
- Student dashboard, locally generated personal QR, enlarged QR, current event, and searchable personal attendance records.
- Organizer dashboard focused on assigned events, scanning, local records, and later sync.
- Event camera QR scanning, student confirmation against the imported roster, duplicate prevention, and attendance receipt.
- Organizer self-check-in and personal QR without account switching.
- Online organizer sign-in downloads the assigned events and that organizer's section roster for offline scanning.
- Offline scans stay on-device until the organizer syncs: SQLite in native apps and IndexedDB in the PWA. The server accepts only assigned events and roster students.

Date entry uses `YYYY-MM-DD`; time uses 24-hour `HH:MM`. Student QR codes
contain a student ID, like the browser prototype. The scanner accepts IDs from
the roster downloaded for that organizer; unknown IDs are rejected and cannot
be manually added from the scanner. Camera access is requested only from the
scanner screen. A denied permission blocks scanning until access is granted.

## Local data and prototype boundaries

For the PWA, build the web export with `npm run build:web`. This creates a
versioned service worker that caches the exported app files and serves the app
shell when offline. It does not cache API responses or replace the native APK.
The PWA remembers the active user's ID and role in IndexedDB so the same account
opens after a browser restart. Explicit logout clears that marker. Browser
passwords are removed from IndexedDB during migration and are kept only in memory
while the signed-in page is open. The PWA asks for the current password whenever
it needs to refresh server attendance or upload organizer scans; it does not
persist organizer bearer tokens. Locally saved events, rosters, and pending
attendance remain available offline. Starting a new session after logout requires
an online sign-in.

On Android and iOS, accounts, events, attendees, and attendance persist in
SQLite (`norwescan.db`). On first launch after upgrading, the app imports the
existing AsyncStorage snapshot under `norwe-scan-mobile-v1` into SQLite in one
transaction, then removes the old snapshot after a successful migration. If
migration fails, the old snapshot is not overwritten and startup shows an error.
Native account passwords are removed from SQLite during migration and are not
written there by future app updates. Browser preview continues to use AsyncStorage
as the legacy source; the web app imports that snapshot into IndexedDB on first
launch and removes the old copy only after the IndexedDB data has loaded
successfully. Browser storage is separate from mobile SQLite and can be cleared
by the user or browser, so sync attendance before clearing site data. The PWA
restores its active ID and role from IndexedDB, strips browser passwords during
migration, and does not reuse native SecureStore credentials.
Existing events, rosters, and receipts are retained. If an ID was
stored as both a student and an admin, the admin account/credentials take
precedence and the duplicate student account is removed. Existing admins now
log in by student ID, not email. Prototype startup also creates the demo admin
if `23-02330` is unused, even when older admins exist. It never resets an existing
password or promotes a student using that ID. Remove this demo provisioning
before production deployment.
On native apps, a successful sign-in saves only the active user's ID and role
in SecureStore; the app restores the matching local profile and opens its home
screen after restart, never a scanner/camera route. Explicit logout clears the
active session and organizer server token, but keeps the device-protected
credential so that account can sign in offline again.
PWA accounts, rosters, events, and attendance use IndexedDB. On first web launch,
the app imports the previous AsyncStorage snapshot and removes it only after the
IndexedDB save succeeds. The active browser session marker also uses IndexedDB;
browser passwords are stripped during migration and are not persisted. PWA data
is separate from native SQLite and can be cleared by browser/site-data settings,
so sync pending attendance before clearing site data. Expo Go, browser previews,
and standalone builds have separate storage.

To pilot the PWA on Render, create a **Static Site** from this repository with
root directory `mobile`, build command `npm ci && npm run build:web:release`, and
publish directory `dist`. Set the static site's `EXPO_PUBLIC_API_URL` to the API
root, such as `https://norwescan-api.onrender.com`; do not append `/health` or
`/manager`. Set the API service's `WEB_ORIGINS` to the exact HTTPS origin Render
assigns to the static site, then redeploy the API. The release build fails early
if the API URL is missing, not HTTPS, or contains a route path.

The service worker caches only the exported app shell, not API responses.
Camera access and PWA installation require a secure context such as HTTPS (or
localhost for development). Test offline launch and local attendance on each
target browser, then reconnect and verify sync against the shared server.
Browser storage is device- and browser-specific.

QR generation, cached-account login, and attendance capture for previously
downloaded assigned events work without an API connection after the app is
loaded. Roster import, organizer access changes, event creation/assignment,
first-time online sign-in after this update, password changes, and attendance
sync require the server. Offline sign-in is enabled only after that account has
successfully signed in online once on the same device; roster-imported accounts
cannot authenticate offline until then. When online sign-in fails due to a
network error, timeout, or temporary server error, the app may use the protected
device credential. Invalid-password and access-denied responses never fall back
to offline login. Test a standalone APK in airplane mode to validate cold launch
independently of Expo Go and Metro.

The API and manager website are in `../server/`; see its README for setup.
Roster imports and event assignments are saved in shared PostgreSQL. Students
can first log in from a different phone after the manager imports their roster.
After initial online sign-in, the app stores the credential in the operating
system's SecureStore for offline sign-in on that phone. Each device must
authenticate online once; credentials are not shared across devices. After a
successful password change, the protected credential is replaced. If the
password changes on another device, an offline device may continue accepting
its cached password until it reconnects and the server validates it.

For local Expo testing, configure `EXPO_PUBLIC_API_URL` in
`mobile/.env.local` and restart Expo. For an APK, set the same variable in the
Expo project's EAS `preview` environment; the preview build profile is bound to
that environment. This URL is included in the app, so use the public HTTPS API
address, never a database URL or password. All phones need a reachable API
endpoint. Organizer scans remain on the phone until the organizer taps Sync.
Student attendance history shows server-confirmed records after refresh.
Students can refresh their own server-synced history from Home or Records while
online; refreshed records are cached in SQLite for offline viewing. The API
verifies the student's ID and password and returns only records for that ID.
Event deletion retains historical attendance receipts. Self-check-in is labeled
as organizer attendance and is available to any logged-in admin managing the event.

## University branding

`src/branding.js` holds the university name, green gradient, and optional photo.
When a campus photo is available, add it to `assets/` and change
`UNIVERSITY_PHOTO` from `null` to `require('../assets/university.jpg')`.
The same banner will use the photo with a dark green overlay on login and
dashboard screens. Until then, it displays a green gradient without downloading
any images. Shared control colors are in `src/ui.jsx`.

## Structure

| Path | Purpose |
| --- | --- |
| `src/app/` | Expo Router entry and screen routes |
| `src/AppScreen.jsx` | Dashboards, events, records, receipts, and navigation |
| `src/Auth.jsx` | Unified login, account help, required password change |
| `src/RosterImport.jsx` | Legacy mobile import component; not used by the current app flow |
| `src/spreadsheet.mjs` | Excel workbook reader |
| `src/roster.mjs` | Shared roster validation and student-only account creation |
| `src/Scanner.jsx` | Camera permission, QR scanning, and roster confirmation |
| `src/ui.jsx` | Shared native controls and existing visual theme |
| `src/model.mjs` | Account, password, event, and attendance rules |
| `src/storage.mjs` | Legacy AsyncStorage migration and browser persistence |
| `src/sqlite-storage.mjs` | Native SQLite tables, migration, and serialized writes |
| `src/remote-sync.mjs` | Remote login, student attendance refresh, password changes, and attendance sync |
| `src/state.jsx` | Shared data/session state and connectivity |

## Checks

```sh
npm test
npm run lint
npm run typecheck
npx expo install --check
npx expo export --platform all
npm run test:ui
```

The migration uses JavaScript. The TypeScript command checks project/module
configuration and parsing; `checkJs` is disabled, so it is not a full static
type-safety guarantee. Model and persistence behavior have executable tests.
The browser smoke tests use the exported `dist/` bundle and headless Microsoft
Edge on Windows. On other platforms, install Chromium using
`npx playwright install chromium` first. They cover the forms and navigation,
but do not replace real-device camera testing.

## Standalone Android APK

`eas.json` includes a preview APK profile. Before building, set
`EXPO_PUBLIC_API_URL` in the EAS `preview` environment to the deployed Render API
URL. Then sign in to your Expo account and link this project if needed:

```sh
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --platform android --profile preview
```

Download and install the resulting APK. The preview profile runs independently
of Expo Go and Metro. App identifiers are currently `com.edgesync.norwescan`;
choose final identifiers before distribution. Launcher artwork is still the Expo
starter artwork; branding work is separate from this behavior migration.

Before a defense, test on a real phone: camera permission allowed/denied,
QR scanning between two phones, organizer check-in, duplicate scans, keyboard
visibility, Android back navigation, restart persistence, roster import, first-login password change,
and cold launch in airplane mode. Bundling cannot verify physical camera behavior.
