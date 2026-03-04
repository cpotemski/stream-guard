---
title: Popup zeigt Live-Status mit Rot Weiss Indikator
type: note
permalink: progress/popup-zeigt-live-status-mit-rot-weiss-indikator
tags:
- progress
- mvp
- popup
- live-status
---

# Umgesetzter Fortschritt

Das Popup zeigt pro wichtigem Channel jetzt einen kompakten Live-Status direkt in der Liste.

## Anzeige
- `🔴` fuer live
- `⚪️` fuer offline
- `❔` bei unbekanntem Status oder fehlgeschlagener Live-Abfrage

## Umsetzung
- Die Live-Status-Logik liefert jetzt explizite Zustaende statt nur `true` oder `false`
- Das Popup laedt die Stati beim Refresh fuer alle wichtigen Channels und rendert den Indikator direkt neben dem Channel-Namen
- Der bestehende Reconcile-Pfad nutzt weiterhin dieselbe Live-Abfrage und behandelt nur `live` als oeffnungsrelevant

## Warum
- Der Status ist damit direkt im Popup sichtbar und nicht mehr nur indirekt ueber geoeffnete Tabs ableitbar
- Fehler in der Twitch-Abfrage werden im UI nicht mehr stillschweigend als offline maskiert

## Zusatz
- Extension-Version wurde als Minor auf `0.2.0` erhoeht