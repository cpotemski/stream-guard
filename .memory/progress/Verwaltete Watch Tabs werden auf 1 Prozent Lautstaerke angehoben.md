---
title: Verwaltete Watch Tabs werden auf 1 Prozent Lautstaerke angehoben
type: note
permalink: progress/verwaltete-watch-tabs-werden-auf-1-prozent-lautstaerke-angehoben
tags:
- progress
- watch-tabs
- player
- audio
- mvp
---

# Umgesetzter Fortschritt

Verwaltete automatisch geoeffnete Watch-Tabs korrigieren jetzt einen stummgeschalteten Player auf minimale Lautstaerke.

## Umsetzung
- Das Content-Script prueft periodisch, ob der aktuelle Tab ein von der Extension verwalteter Watch-Tab ist
- In diesem Fall wird das `video`-Element direkt geprueft
- Wenn der Player stummgeschaltet ist oder `volume` auf `0` steht, wird `muted` aufgehoben und die Lautstaerke auf `1%` gesetzt
- Erfolgreiche Korrekturen erscheinen als `watch:playback-corrected` im Debug-Log

## Entscheidung
- Es wird bewusst direkt ueber das Video-Element korrigiert statt ueber einen simulierten `M`-Keypress
- Das ist robuster und weniger von Fokus- oder Shortcut-Zustaenden abhaengig

## Zusatz
- Extension-Version wurde als Minor auf `0.6.0` erhoeht