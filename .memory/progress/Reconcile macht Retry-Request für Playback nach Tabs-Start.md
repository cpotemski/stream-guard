---
title: Reconcile macht Retry-Request für Playback nach Tabs-Start
type: note
permalink: progress/reconcile-macht-retry-request-fur-playback-nach-tabs-start
tags:
- status
- playback
---

## Entscheidung
- Selbst bei erfolgreichem Tab-Open kann der direkte Playback-Request direkt am Reconcile-Zeitpunkt scheitern (Content-Skript meist noch nicht ready).
- Darum wird direkt nach dem Reconcile sofort und erneut nach 3 Sekunden nachgeschoben, damit der initiale State nach dem Aufwärmen korrekt nachgezogen wird.

## Umgesetzt
- `extension/src/background.js`
  - `requestPlaybackStateForManagedTabs` wird sofort und verzögert (3s) aufgerufen.
- [MVP-Kontext] kein neues Datenmodell, nur robustere Initial-Synchronisation.

## Versionshinweis
- `extension/manifest.json` inzwischen auf `0.7.16`.