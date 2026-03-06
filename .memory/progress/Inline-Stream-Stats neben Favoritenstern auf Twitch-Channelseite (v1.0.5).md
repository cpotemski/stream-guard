---
title: Inline-Stream-Stats neben Favoritenstern auf Twitch-Channelseite (v1.0.5)
type: progress
permalink: progress/inline-stream-stats-neben-favoritenstern-auf-twitch-channelseite-v1.0.5
status: active
affected_version: 1.0.5
---

# Kontext
Auf der Twitch-Channelseite wurde bisher nur der Watch-Guard-Stern in der Top-Navigation eingeblendet.

# Umsetzung
- Neben dem Stern wurde ein kompaktes Inline-Stats-Badge im gleichen Header-Bereich eingebunden.
- Das Badge nutzt bestehende Runtime-Daten (Claim-Count, Watch-Streak, Claim-Ready), die bereits fuer Popup-Stats gepflegt werden.
- Das Badge wird nur fuer als wichtig markierte Channels angezeigt (gleiche Semantik wie Stern aktiv).
- Das Rendering wurde auf ein 5s-Refresh mit Deduplizierung begrenzt, um unnötige Re-Renders zu vermeiden.
- Layout und Farben wurden kompakt gehalten und an die vorhandene Popup-Optik angelehnt.

# Geaenderte Dateien
- `extension/src/content.js`
- `extension/src/styles.css`
- `extension/manifest.json` (Version auf 1.0.5)

# Ergebnis
Die Stats sind direkt beim Stern sichtbar, ohne den v1-Flow zu erweitern oder neue Backend-Logik einzufuehren (YAGNI-konform).