---
title: Auto-Open nur fuer live Channels
type: note
permalink: progress/auto-open-nur-fuer-live-channels
tags:
- progress
- live-detection
- mvp
---

# Umgesetzter Fortschritt

Die Auto-Manage-Logik oeffnet jetzt nicht mehr pauschal die ersten `maxStreams` konfigurierten Channels.

Stattdessen:
- die Prioritaetsreihenfolge bleibt erhalten
- es werden nur Channels automatisch geoeffnet, fuer die die Live-Pruefung ein positives Signal liefert
- bei nicht verfuegbarem oder unsicherem Status bleibt der Channel geschlossen

## Technische Umsetzung
- Hintergrundlogik nutzt eine schlanke Twitch-GQL-Abfrage fuer den Live-Status
- `maxStreams` bleibt das Limit fuer gleichzeitig zu oeffnende Live-Tabs
- Extension-Version wurde als Patch auf `0.1.2` erhoeht

## MVP-Nutzen
- weniger unnoetige Tabs
- Verhalten entspricht besser dem Zweck des Watch Guard MVP