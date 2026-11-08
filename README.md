<div align="center">
  <h1>⬛ EdgeSync</h1>
  <p><b>Offline-First QR Attendance Engine</b></p>
  
  <p>
    <img src="https://img.shields.io/badge/Domain-Edge_Computing-black?style=flat-square" alt="Domain" />
    <img src="https://img.shields.io/badge/Architecture-Offline--First-black?style=flat-square" alt="Architecture" />
    <img src="https://img.shields.io/badge/Type-Academic_Thesis-black?style=flat-square" alt="Thesis" />
  </p>
</div>

<br>

> An architectural thesis project exploring distributed, fault-tolerant attendance tracking for high-density academic environments operating under severe network constraints.

<br>

## 📌 About

This repository contains the core implementation and architectural documentation for **EdgeSync** — my undergraduate thesis project under the BS Computer Science program.

EdgeSync is built to solve a recurring problem in Philippine universities: **network congestion during large-scale events renders traditional web-based attendance systems unusable.** The system shifts critical validation and storage logic to the edge (local scanning devices), ensuring zero-downtime logging regardless of venue infrastructure.

This repo is structured around a **proof-of-concept implementation**, focusing on:
- Roster-based validation of scanned attendance
- Local state persistence using embedded databases
- Asynchronous reconciliation with a central cloud server

---

## 🎯 The Problem Context

Traditional web-based attendance systems critically fail during large-scale university events due to:
- Network congestion and bandwidth throttling
- Localized Wi-Fi drops
- Bottlenecked queues and missing data

Organizers are forced to revert to inefficient **pen-and-paper tracking**, which introduces data entry errors, delays, and manual reconciliation overhead.

---

## ⚙️ The Engineering Solution

EdgeSync eliminates real-time cloud dependency by shifting data validation and storage directly to the **edge** (the local scanning device). This architecture guarantees:

- ✅ **Zero-downtime** event logging regardless of venue infrastructure
- ✅ **Roster-based verification** of scans without querying a live database
- ✅ **Asynchronous state reconciliation** when network connectivity is restored

---

## 🧠 Core System Mechanics

| Component | Description |
| :--- | :--- |
| **Local Roster Validation** | QR codes carry the scanned student ID. The local offline scanner checks it against the roster downloaded for the assigned event and rejects unknown IDs instantly, without live database queries. |
| **Local State Persistence** | Scanned records are immediately committed to an embedded local database (SQLite on devices, IndexedDB in the browser PWA). This ensures high-throughput, latency-free scanning by decoupling from remote APIs. |
| **Asynchronous State Reconciliation** | Upon network restoration, the system packages pending batch logs and pushes them to the central cloud server. Duplicate scans are deduplicated before final insertion. |

---

## 🛠️ Tech Stack

Only the stacks actually used in this proof of concept:

| Layer | Technology |
| :--- | :--- |
| Mobile / PWA | React Native Web + Expo SDK 57, Expo Router, PWA service worker |
| Local persistence | `expo-sqlite` on devices and IndexedDB in the browser PWA |
| Scanning and QR | `expo-camera`, `expo-haptics`, `react-native-qrcode-svg` |
| API server | Node.js (`node:http` + `node:crypto`) with PostgreSQL via `pg` |
| Roster import | CSV and Excel parsing via `@e965/xlsx` |
| Quality checks | Node.js test runner, ESLint, Playwright, TypeScript config check |

---

## 🚀 Deployment

- **API, manager console, PostgreSQL** — Oracle Cloud Always Free VM, Docker Compose, and Caddy for HTTPS. See `server/README.md`.
- **PWA** — Vercel static site built from `mobile/`. See `mobile/README.md`.

The production server deploy is one command after the first checkout:

```sh
cd server
./deploy.sh
```

If Git did not preserve the executable bit (for example, after copying files from
Windows), run `chmod +x deploy.sh` once.

---

## 🗂️ Repository Structure

| Path | Purpose |
| :--- | :--- |
| `mobile/` | Expo / React Native app with the offline PWA export, scanner, dashboards, records, and sync |
| `server/` | Node.js attendance API and system-manager console backed by PostgreSQL |
| `prototype/` | Browser prototype and admin authentication flow checks |
| `mobile/design/ui-concepts/` | Generated visual direction references for the app |
