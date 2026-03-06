---
title: Diagnostics Logging ueber Ringbuffer in chrome.storage.local (v1)
type: note
permalink: decisions/diagnostics-logging-ueber-ringbuffer-in-chrome.storage.local-v1
status: active
date: 2026-03-05
version: 0.7.68
---

## Entscheidung
Diagnose-Telemetrie wird in v1 als Ringbuffer im Extension-Storage (`chrome.storage.local`) persistiert, statt ueber Native Helper oder externe Dienste.

## Begruendung
- YAGNI: keine zusaetzliche Infrastruktur, keine Companion-App.
- Robuste v1-Lieferbarkeit: funktioniert offline und ohne Setup.
- Debugging-tauglich: Export per Popup als JSON fuer reproduzierbare Analysen.

## Umfang
- Quellen: Worker-Events + gezielte Tab-Events.
- Begrenzung: Maximal 5000 Events, aeltere Eintraege werden verworfen.
- Bedienung: Export und Clear direkt im Popup.