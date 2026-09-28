# CCIS Pythons UI Concepts

This folder stores generated design references for the mobile attendance app.
They are visual direction only, not screenshots of implemented functionality.

## Direction

- Identity: `NORWEScan` for the product and CCIS Pythons for the department,
  expressed through black, Python yellow, warm paper,
  an angular grid, and a restrained scale motif.
- Character: academic athletics meets dependable field equipment.
- Priorities: obvious online/offline state, one-handed actions, large QR and scan
  feedback, readable records, and clear separation between student and organizer tasks.
- Avoid: purple gradients, glassmorphism, floating decorative blobs, excessive
  dashboard cards, unreadable charts, mascot clip art, and ornamental fake data.

## Current Images

- `ccis-student-flow-v3.png`: unified login, first-login password change, and student home.
- `ccis-admin-flow-v3.png`: organizer dashboard, roster import preview, and QR scan result.
- `norwescan-wordmark.png`: reusable visual reference for the uniform product wordmark.

The earlier images remain in this folder for comparison. Use the v3 boards as the
current implementation reference.

## User-Centric Copy Rules

- Show the `NORWEScan` wordmark once at the entry or top-level screen, not on every page.
- Name task screens by the user's current action, such as `Security`, `Review roster`,
  or `Scan Attendance`.
- Keep copy that explains an action, state, or result; remove slogans, coordinates,
  version labels, and repeated department text.
- Reserve the angular display treatment for the wordmark. Use a consistent readable
  sans-serif for headings, fields, buttons, records, and status messages.

## Typography Direction

- Product wordmark: exact spelling `NORWEScan`, with white `NORWE` and yellow
  `Scan`. Use custom diagonal cuts on the wordmark only, never on body text.
- [Oxanium](https://github.com/sevmeyer/oxanium) (OFL): primary reference for
  squared display letters and controlled angled cuts.
- [League Spartan](https://github.com/theleagueof/league-spartan) (OFL):
  reference for strong athletic headings and buttons.
- [Barlow](https://github.com/jpt/barlow) (OFL): reference for compact,
  practical interface labels and readable supporting text.
- [Rajdhani](https://github.com/itfoundry/rajdhani) (open source): optional
  technical label style. Use sparingly because condensed text is harder to read.

These fonts inform the direction; the slashed `NORWEScan` wordmark should be
redrawn as an original vector before production rather than modifying a font file.

## Public References

These repositories are references for patterns and architecture, not screens to copy.

- [MiniLMS](https://github.com/imdeepakyadav/MiniLMS) (MIT): Expo Router,
  AsyncStorage, offline feedback, shared design tokens, and consistent UI primitives.
- [School OS](https://github.com/shabirkhan-dev/school-os) (MIT/Apache-2.0):
  attendance-first product framing, role-specific surfaces, roster views, and an
  Expo mobile plus web-admin architecture.
- [Visitor Management System](https://github.com/Rajeev02/Visitor-Management-System)
  (MIT): QR scanner states, verification feedback, role dashboards, and audit-style records.
- [absensi1](https://github.com/arvardy184/absensi1): closest functional comparison
  for a single Expo attendance app with student/admin roles, local data, and file import.
  It is an architecture reference only because its repository does not state a license.

No source code or artwork from these repositories is copied into this project.
