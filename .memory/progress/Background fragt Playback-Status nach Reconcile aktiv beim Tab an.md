---
title: Background fragt Playback-Status nach Reconcile aktiv beim Tab an
type: note
permalink: progress/background-fragt-playback-status-nach-reconcile-aktiv-beim-tab-an
tags:
- status
- playback
- debug
---

## Entscheidung
- Der anfänglich falsche/alt wirkende Status bei neu geöffnetten Watch-Tabs lässt sich mit reinem Popup-Refresh nicht zuverlässig beheben, weil die Hintergrund-Tabs zeitweise weniger zuverlässig pollbar sind.
- Ab jetzt fragt der Background direkt bei jedem Reconcile pro verwaltetem Tab den aktuellen Playback-Zustand an.
- Content-Script verarbeitet dafür eine neue Message `watch:request-playback-state` und triggert dann einen frischen `ensureManagedPlaybackState()`-Zyklus.

## Umgesetzt
- `extension/src/background.js`
  - Neue Funktion `requestPlaybackStateForManagedTabs(...)`.
  - Aufruf nach jedem Reconcile, inkl. geloggtem Fehlerpfad `reconcile:playback-state-request-failed`.
- `extension/src/content.js`
  - Message-Listener für `watch:request-playback-state` ergänzt.
- `extension/manifest.json`
  - Version auf `0.7.14` erhöht.

## Risiko
- Falls der Tab noch nicht bereit ist (noch kein Content-Script), kann die Anfrage scheitern; der nächste Reconcile wird erneut versuchen.