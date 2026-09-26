## Mobile Prototype

The React Native + Expo migration lives in [`mobile/`](mobile/README.md).
Run `npm install` and `npx expo start` from that directory to use Expo Go.
The original browser prototype remains in `prototype/` for reference. The mobile
app now uses one student-ID login, faculty CSV roster imports, and a mandatory
first-login password change. Synchronization is still simulated, and data is
saved only on the current device. See the mobile README for demo credentials.

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
- Cryptographic QR payload validation
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
- ✅ **Cryptographic verification** of QR payloads without querying a live database
- ✅ **Asynchronous state reconciliation** when network connectivity is restored

---

## 🧠 Core System Mechanics

| Component | Description |
| :--- | :--- |
| **Cryptographic Edge Validation** | Student QR payloads are embedded with secure HMAC signatures. The local offline scanner verifies a code's authenticity instantly, preventing spoofing without live database queries. |
| **Local State Persistence** | Scanned records are immediately committed to an embedded local database (e.g., SQLite). This ensures high-throughput, latency-free scanning by decoupling from remote APIs. |
| **Asynchronous State Reconciliation** | Upon network restoration, the system packages verified batch logs and pushes them to the central cloud server. Conflict resolution ensures duplicate scans are deduplicated before final insertion. |

---

## 🗂️ Repository Structure
