---
title: Uptime Erkennung priorisiert jetzt den groessten Zeitwert
type: note
permalink: progress/uptime-erkennung-priorisiert-jetzt-den-groessten-zeitwert
tags:
- progress
- watchtime
- dom
- bugfix
- mvp
---

# Umgesetzter Fortschritt

Die Uptime-Erkennung im Content-Script bevorzugt jetzt den groessten plausiblen Zeitwert statt den ersten Treffer.

## Warum
- Auf Twitch konnte ein falscher kurzer `MM:SS`-Wert erfasst werden, obwohl die sichtbare Stream-Uptime deutlich laenger war
- Das verfälschte `lastUptimeSeconds` und damit die Broadcast-Session-Heuristik

## Umsetzung
- Der fachlich unpassende erste Selector wurde entfernt
- Alle passenden Kandidaten werden weiter geprueft
- Verwendet wird jetzt der groesste erfolgreich geparste Zeitwert

## Zusatz
- Extension-Version wurde als Patch auf `0.4.1` erhoeht