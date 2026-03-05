---
title: Popup rendert Live-Channels jetzt zweizeilig mit Stats unter dem Namen (v0.7.42)
type: note
permalink: progress/popup-rendert-live-channels-jetzt-zweizeilig-mit-stats-unter-dem-namen-v0.7.42
---

# Umgesetzt (v0.7.42)

- Popup-Channelzeilen wurden fuer Live-Channels auf zweizeiliges Layout umgestellt.
- Erste Zeile: Status-Icon + `index. channelname`.
- Zweite Zeile (nur bei `live`): Watchtime, Claim-Count, Streak und Claim-Ready-Icon.
- Offline/Unknown-Zeilen bleiben einzeilig ohne Stats-Zeile.

## Technisch
- `popup.js`: Render-Struktur auf `channel-details` + optionale `channel-stats` erweitert.
- `styles.css`: neue Styles fuer `channel-details`, `channel-name`, `channel-stats`; Label-Ausrichtung auf `flex-start` angepasst.
- Nebenbei einen fehlenden schliessenden Block bei `.control-button` korrigiert.

## Version
- `manifest.json` auf `0.7.42` erhoeht (Patch).