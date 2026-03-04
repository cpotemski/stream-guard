---
title: Fix fuer vorschnelles Schliessen der Watch Group
type: note
permalink: progress/fix-fuer-vorschnelles-schliessen-der-watch-group
tags:
- progress
- bugfix
- tabs
- mvp
---

# Umgesetzter Fortschritt

Ein Bug beim Delta-Sync konnte neu geoeffnete Watch-Tabs zu frueh wieder schliessen.

## Fix
- Ein verwalteter Tab wird nicht mehr als ungueltig behandelt, solange er noch laedt und noch keine stabile Twitch-Channel-URL erkennbar ist
- Channels, deren verwalteter Tab per Redirect nicht mehr auf den erwarteten Stream zeigt, werden als voruebergehend abgekoppelt markiert
- Solche Channels werden erst dann wieder automatisch geoeffnet, wenn sie zwischenzeitlich nicht mehr live waren

## Wirkung
- `Open Watch Group` schliesst frisch erzeugte Tabs nicht mehr sofort wieder
- Bei Raid/Redirect wird der betroffene Tab geschlossen, aber nicht im Minuten-Takt sofort erneut geoeffnet

## Zusatz
- Extension-Version wurde als Patch auf `0.1.4` erhoeht