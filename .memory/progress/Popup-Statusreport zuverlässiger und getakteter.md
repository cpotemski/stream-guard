---
title: Popup-Statusreport zuverlässiger und getakteter
type: note
permalink: progress/popup-statusreport-zuverlassiger-und-getakteter
tags:
- status
- popup
- reliability
- plan
---

## Entscheidung
- Popup-Status darf beim Start schnell reagieren, danach reicht ein regelmäßiger Poll.
- Implementiert wird ein 30-Sekunden-Initialfenster mit 5-Sekunden-Intervallen und danach 60 Sekunden.
- `manifest.json` wird als Patch-Level erhöht, da Änderung an der Extension-UI/Logik vorliegt.
- Bei unbekanntem Twitch-Live-Status wird statt falscher "live"-Fallback-Anzeige ein neutraler Fehler-/Prüfstatus (`🟠`) gezeigt.

## Umgesetzt
- `extension/src/popup.js`
  - Poll-Mechanik von statischem 5s-`setInterval` auf adaptives Fenster + Intervall-Shift umgestellt.
  - Initialer Start- und Toggle-Pfad triggert jetzt explizit einen frischen, schnellen Status-Refresh.
  - Live-Status `unknown` in der Status-Ikone sauberer dargestellt.
- `extension/manifest.json`
  - Version auf `0.7.12` angehoben.

## Risiken / offene Punkte
- Live/Offline bleibt polling-basiert im Popup; bei extremen Twitch-API-Ausfällen bleibt der Status `🟠` solange kein erfolgreicher Update-Poll zurückkommt.
- Es wurde keine zusätzliche Push-/PushState-Infrastruktur eingebaut, um Änderungen außerhalb der Polls zu pushen (MVP-konform).