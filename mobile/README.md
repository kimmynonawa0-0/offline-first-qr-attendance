# NORWE-SCAN mobile prototype

React Native + Expo attendance prototype with a university-green gradient theme.
The mobile account flow follows the revised faculty-roster design, not the old signup flow.
The browser prototype is retained for comparison. This is a native interface,
not a WebView wrapper.

## Run with Expo Go

Use a current Node.js LTS release (Node 22.13 or newer) and an Expo Go version
compatible with Expo SDK 57.

```sh
cd mobile
npm install
npx expo start
```

Scan the development QR with Expo Go on Android. Keep your phone and computer
on the same network. To preview in a browser, run `npm run web`.

On a fresh installation, log in as **23-02330** / **BSCS-3C** and change the
password before entering the admin dashboard. This is a prototype-only seed
account, not a production administrator provisioning mechanism.
An existing `DEMO-ADMIN` account is renamed to `23-02330` on restart, retaining
its password and attendance. A conflicting existing ID stops migration without overwriting data.

Import `examples/faculty-roster.csv` from the dashboard. Log out, then log in as
**2024-00123** / **BSCS-3C** and choose a new password to enter the student dashboard.
Both roles use the same login page. The saved account determines the role;
CSV files cannot grant admin access.

## Faculty roster

Export a faculty spreadsheet as **CSV UTF-8 (.csv)**. Direct `.xlsx`/`.xls`
imports are not supported in this version. Format ID cells as text before export
so Excel does not discard leading zeros.

```csv
student_id,name,section,email
2024-00123,Juan Dela Cruz,BSCS-3C,juan@example.com
2024-00124,"Santos, Maria",BSCS-3C,maria@example.com
```

Email is optional. `Student ID` and `Full Name` header spellings also work.
The app validates the complete file, previews the first five rows and counts,
then requires confirmation. Limits: 1 MB and 5,000 students per file. Malformed
rows, duplicate IDs within the file, and missing required fields reject the
whole import. Existing IDs (including admins) are skipped: names, passwords,
roles, and sections are not overwritten. Reimporting cannot reset a password.

New accounts use the exact section text as their temporary password and must
replace it with a different password of at least 12 characters. Dashboard,
attendance, and import access remain blocked until that change is saved.

The administrator website, role assignment by URL, admin requests/proofs, and
automated password recovery are deferred. The old auto-filled email signup/reset
flow has been removed; the left-aligned Forgot password link shows account help.

## Migrated flows

- One student-ID login with automatic role selection, password visibility, and logout confirmation.
- Admin faculty roster import instead of student or admin self-signup.
- Mandatory first-login password change for both roles, persisted across app restarts.
- Student dashboard, locally generated personal QR, enlarged QR, current event, and searchable personal attendance records.
- Admin dashboard, today's attendance, event creation/deletion, history with expandable attendees, and recent attendance.
- Event camera QR scanning, student confirmation, demo scan fallback, duplicate prevention, and attendance receipt.
- Organizer self-check-in and personal QR without account switching.
- Network indicator, pending local records, and explicitly labeled simulated sync.

Date entry uses `YYYY-MM-DD`; time uses 24-hour `HH:MM`.
QR codes contain a student ID, like the browser prototype. An unknown ID can be
scanned, but the organizer must enter its name before recording attendance.
Camera access is requested only from the scanner screen. A denied permission
does not block the demo scan option.

## Local data and prototype boundaries

Accounts, events, and attendance persist in AsyncStorage under
`norwe-scan-mobile-v1` (data schema version 2). Updates save a complete snapshot before reporting success.
Existing version-1 accounts keep their current passwords for their next login,
then must change them. Existing events and receipts are retained. If an ID was
stored as both a student and an admin, the admin account/credentials take
precedence and the duplicate student account is removed. Existing admins now
log in by student ID, not email. Prototype startup also creates the demo admin
if `23-02330` is unused, even when older admins exist. It never resets an existing
password or promotes a student using that ID. Remove this demo provisioning
before production deployment.
Closing the app preserves data; users log in again after a fresh launch.
Browser localStorage and mobile storage are separate: previous browser accounts
and records are not automatically imported. Expo Go, browser previews, and
standalone builds also have separate storage.

QR generation, event management, local login, and attendance capture work without
an API connection after the app is loaded. Test a standalone APK in airplane mode
to validate cold launch independently of the Expo development server.

This migration does not add a backend, database server, real email delivery,
encrypted credentials, signed QR codes, or cross-device synchronization. Passwords
remain plain text demo data. A section is a shared, guessable temporary password;
forced change does not verify student identity or make this production-secure.
Production needs trusted account provisioning, server-side authorization,
secure password storage, and a safer initial activation process. Use demo data only.

Demo sync changes local flags; it uploads nothing. A student using a different
phone will not receive imported accounts or attendance records until real sync exists.
Demonstrate import and student login on the same device for now. There is no
shared database or mobile account-import path for students yet.
Student records are scoped to their ID on the current device. Event deletion
retains historical attendance receipts. Self-check-in is labeled as organizer
attendance and is available to any logged-in admin managing the event.

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
| `src/RosterImport.jsx` | CSV picker, preview, and import confirmation |
| `src/roster.mjs` | CSV validation and student-only account creation |
| `src/Scanner.jsx` | Camera permission, scanning, and manual demo entry |
| `src/ui.jsx` | Shared native controls and existing visual theme |
| `src/model.mjs` | Account, password, event, and attendance rules |
| `src/storage.mjs` | Serialized local persistence |
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

`eas.json` includes a preview APK profile. When ready to build, sign in to your
Expo account and link this project:

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
