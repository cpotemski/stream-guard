---
title: Streak-Auslesen nur fuer autorisierte Kanäle (v0.7.34)
type: note
permalink: progress/streak-auslesen-nur-fuer-autorisierte-kanale-v0.7.34
---

## Kontext
Nach dem Allowlist-Gate im Background wurde weiterhin beobachtet, dass das Content-Script den Streak-Dialog auch auf nicht gelisteten Kanaelen oeffnet/ausliest.

## Verbindliche Entscheidung (MVP/YAGNI)
Das Streak-Auslesen wird bereits im Content-Script vor dem UI-Probe geblockt, wenn der Kanal nicht autorisiert ist.

## Umsetzung
- In `reportWatchStreak()` wird direkt nach Kanal-Ermittlung ein `watch:authorize`-Check ausgefuehrt.
- Nur bei `authorized === true` wird das Reward-Center geoeffnet und der Streak gelesen.
- Ergebnis: Keine Streak-UI-Probes mehr auf Streams ausserhalb der Streamer-Liste.

## Versionierung
- Extension-Version auf `0.7.34` (Patch) angehoben.

## Verifikation
- Syntax-Check erfolgreich: `node --check extension/src/content.js`.