---
title: Optimistic Star-Update auf Streamer-Seite (v0.7.38)
type: progress
permalink: progress/optimistic-star-update-auf-streamer-seite-v0.7.38
tags:
- mvp
- ui
- latency
---

## Kontext
Beim Klick auf den Stern auf einer Streamer-Seite war die UI-Reaktion spuerbar verzoegert, da das Rendern auf die Antwort von `channel:toggle` aus dem Background wartet (inkl. moeglicher Auto-Manage-Reconcile-Laufzeit).

## Entscheidung (YAGNI/MVP)
Fuer den MVP wird kein groesserer Umbau der Toggle-Mechanik eingefuehrt. Stattdessen wurde ein optimistisches UI-Update umgesetzt: Stern sofort umschalten, bei Fehler rollback.

## Umsetzung
- `extension/src/content.js`
  - Klick-Handler rendert sofort den invertierten Sternzustand (`optimisticState`).
  - Waehrend Request ist `button.dataset.pending` gesetzt, um Doppel-Klick-Rennen zu vermeiden.
  - Bei fehlgeschlagenem/abgebrochenem Request rollback auf vorherigen Zustand + Fehler-Toast.
  - Bei Erfolg finaler Zustand aus `response.settings` zur Konsistenz.
- `extension/manifest.json`
  - Version auf `0.7.38` erhoeht.

## MVP-Risiko
- Bei sehr langsamen Requests bleibt die Server-/Background-Bestaetigung weiter spaet, aber die wahrgenommene UI-Latenz ist sofort reduziert.
- Keine neue Architektur, keine vorgezogenen Features.