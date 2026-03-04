---
title: Popup zeigt Watchtime pro verwaltetem Channel
type: note
permalink: progress/popup-zeigt-watchtime-pro-verwaltetem-channel
tags:
- progress
- mvp
- popup
- watchtime
---

# Umgesetzter Fortschritt

Das Popup zeigt jetzt pro aktuell verwaltetem Channel eine kompakte Watchtime direkt in der Liste.

## Umsetzung
- Runtime-State fuehrt jetzt fluechtige `watchSessionsByChannel`
- Beim Oeffnen eines neuen verwalteten Watch-Tabs wird pro Channel eine Session mit `startedAt` angelegt
- Beim Schliessen, Reset oder Stop werden diese Session-Daten wieder entfernt
- Das Popup rendert die Watchtime aus diesem Runtime-State direkt neben dem Channel-Namen
- Solange das Popup offen ist, wird die Anzeige lokal weiter hochgezaehlt

## Aktuelle Leitplanke
- Das ist bewusst die Runtime-Basis fuer Watchtime im aktuellen verwalteten Watch-Lauf
- Der spaetere Uptime-basierte Reset auf echte Broadcast-Sessions ist damit noch nicht umgesetzt, aber technisch sauber anschliessbar

## Zusatz
- Extension-Version wurde als Minor auf `0.3.0` erhoeht