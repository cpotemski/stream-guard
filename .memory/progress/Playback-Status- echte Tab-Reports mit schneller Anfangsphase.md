---
title: 'Playback-Status: echte Tab-Reports mit schneller Anfangsphase'
type: note
permalink: progress/playback-status-echte-tab-reports-mit-schneller-anfangsphase
tags:
- progress
- playback
- popup
- status
---

## Entscheidung
- Popup-Status wird nur aus `runtimeState.playbackStateByChannel` dargestellt, also aus dem letzten vom verwalteten Tab gesendeten Wert.
- Keine künstliche Status-Übersteuerung im Reconcile mehr.
- Neue Polling-Strategie beim Tab: beim (Neu-)Öffnen kurze Burst-Phase (`6` Reports im Abstand `5s`), danach dauerhaft `60s` Interval.

## Umgesetzt
- `extension/src/content.js`
  - Adaptive Playback-Poll-Zeitsteuerung implementiert.
  - `startPlaybackStatePolling()` bei Seitenwechsel auf neuen Channel.
- `extension/src/background.js`
  - `watch:playback-state` speichert den gemeldeten Zustand in `playbackStateByChannel`.
  - `reconcileManagedTabs` setzt keine Default-`ok`-Werte mehr.
- `extension/src/popup.js`
  - Anzeige nutzt robust den letzten gespeicherten Playback-Zustand (`paused`/`muted`/`ok`).
- `extension/manifest.json`
  - Version `0.7.10`.

## Hinweis
- Der Status bleibt der letzte bekannte Tab-Wert, solange der Tab keinen neuen Status sendet.