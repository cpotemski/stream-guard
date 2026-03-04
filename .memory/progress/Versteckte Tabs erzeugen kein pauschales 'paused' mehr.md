---
title: Versteckte Tabs erzeugen kein pauschales 'paused' mehr
type: note
permalink: progress/versteckte-tabs-erzeugen-kein-pauschales-paused-mehr
tags:
- status
- playback
---

## Entscheidung
- Wiederholte Befunde zeigen: Bei frisch gestarteten, im Hintergrund geöffneten Watch-Tabs wird `video.paused` kurzfristig `true` gemeldet und bleibt als `paused` im Popup, obwohl der Stream später beim Tabfokus als `ok` erkannt wird.
- Um diesen Start-Fehlstatus zu vermeiden, wird `paused` in diesem Kontext nicht mehr als finaler Zustand interpretiert, solange der Tab aktuell nicht sichtbar ist.

## Umgesetzt
- `extension/src/content.js`
  - `getPlaybackState` berücksichtigt jetzt `document.hidden` / `document.visibilityState`.
  - In verstecktem Kontext wird bei `needsPlaybackResume` erstmal `ok` zurückgegeben.
  - `visibilitychange` wird als zusätzlicher Trigger für frisches Playback-Reporting genutzt.
- `extension/manifest.json`
  - Version auf `0.7.15` erhöht.

## Hinweis
- Wenn der Tab sichtbar wird und dort wirklich pausiert bleibt, wird `paused` weiterhin gemeldet.