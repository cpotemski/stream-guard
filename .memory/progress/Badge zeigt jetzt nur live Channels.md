---
title: Badge zeigt jetzt nur live Channels
type: note
permalink: progress/badge-zeigt-jetzt-nur-live-channels
tags:
- progress
- badge
- ui
- mvp
---

# Umgesetzter Fortschritt

Der Extension-Badge zeigt jetzt nicht mehr die Anzahl aller wichtigen Channels, sondern nur noch die Anzahl aktuell live erkannter Channels.

## Umsetzung
- Der Background nutzt fuer den Badge dieselbe Live-Status-Quelle wie das Popup
- Gezaehlt werden alle wichtigen Channels mit Status `live`
- Das `maxStreams`-Limit beeinflusst die Badge-Zahl dabei nicht

## Zusatz
- Extension-Version wurde als Patch auf `0.5.1` erhoeht