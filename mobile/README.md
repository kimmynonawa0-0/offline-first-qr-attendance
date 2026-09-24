# NORWE-SCAN mobile prototype

React Native + Expo migration of `../prototype`, preserving the prototype
account/event workflows with a university-green gradient theme.
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

Student demo login: **2024-00123** / **password**.
Admins must sign up first using **okims@gmail.com** or **test@example.com**.
The allowlist is `ALLOWED_ADMIN_EMAILS` in `src/model.mjs`.

## Migrated flows

- Separate student and admin login, account creation, password visibility, and logout confirmation.
- Admin signup: approved email, auto-filled expiring code, account details, return to login.
- Student/admin password recovery: registered email, auto-filled code, new password. Other account details remain unchanged; shared student emails require student ID.
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
`norwe-scan-mobile-v1`. Updates save a complete snapshot before reporting success.
Closing the app preserves data; users log in again after a fresh launch.
Browser localStorage and mobile storage are separate: previous browser accounts
and records are not automatically imported. Expo Go, browser previews, and
standalone builds also have separate storage.

QR generation, event management, local login, and attendance capture work without
an API connection after the app is loaded. Test a standalone APK in airplane mode
to validate cold launch independently of the Expo development server.

This migration does not add a backend, database server, real email delivery,
encrypted credentials, signed QR codes, or cross-device synchronization. Passwords
remain plain text demo data. Codes auto-fill and expire after 15 minutes; they
do not prove email ownership. Use demo credentials only.

Demo sync changes local flags; it uploads nothing. A student using a different
phone will not receive an organizer's attendance records until real sync exists.
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
| `src/Auth.jsx` | Login, signup, and recovery popups |
| `src/Scanner.jsx` | Camera permission, scanning, and manual demo entry |
| `src/ui.jsx` | Shared native controls and existing visual theme |
| `src/model.mjs` | Account, verification, event, and attendance rules |
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
visibility, Android back navigation, restart persistence, password recovery,
and cold launch in airplane mode. Bundling cannot verify physical camera behavior.
