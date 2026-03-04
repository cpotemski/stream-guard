---
title: Watchtime resetet jetzt an gemeldeter Stream Uptime
type: note
permalink: progress/watchtime-resetet-jetzt-an-gemeldeter-stream-uptime
tags:
- progress
- mvp
- watchtime
- content-script
---

# Umgesetzter Fortschritt

Die Watchtime pro Channel kann jetzt an einer neu erkannten Broadcast-Session statt nur am lokalen Watch-Start resetten.

## Umsetzung
- Das Content-Script liest periodisch die sichtbare Stream-Uptime auf Twitch aus
- Verwaltete Watch-Tabs melden diese Uptime als `watch:uptime` an den Background
- Der Runtime-State fuehrt dafuer jetzt zusaetzlich `broadcastSessionsByChannel`
- Der Background leitet daraus einen geschaetzten Broadcast-Startzeitpunkt ab
- Wenn die gemeldete Uptime deutlich zurueckspringt oder der geschaetzte Broadcast-Start stark abweicht, wird die Watchtime fuer genau diesen Channel neu gestartet

## Leitplanke
- Das bleibt bewusst pragmatisch und DOM-abhaengig
- Selektoren koennen bei Twitch-Aenderungen nachjustiert werden

## Zusatz
- Extension-Version wurde als Minor auf `0.4.0` erhoeht