---
title: Uptime Erkennung nutzt jetzt Page Text Fallback
type: note
permalink: progress/uptime-erkennung-nutzt-jetzt-page-text-fallback
tags:
- progress
- watchtime
- dom
- bugfix
- mvp
---

# Umgesetzter Fortschritt

Die Uptime-Erkennung hat jetzt einen haerteren Fallback ueber den sichtbaren Seitentext.

## Umsetzung
- Nach den direkten DOM-Kandidaten wird jetzt der sichtbare Page-Text geprueft
- Bevorzugt wird eine Zeitangabe vor `since live`
- Falls das nicht greift, wird die groesste sichtbare Zeitangabe der Seite verwendet

## Warum
- Auf Twitch konnten die direkten Selektoren weiterhin nur einen kurzen Nebentimer liefern
- Der sichtbare Text `... since live stream started` liefert in deinem Fall das robustere Signal

## Zusatz
- Extension-Version wurde als Patch auf `0.4.2` erhoeht