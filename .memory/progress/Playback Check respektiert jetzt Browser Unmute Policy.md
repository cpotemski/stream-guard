---
title: Playback Check respektiert jetzt Browser Unmute Policy
type: note
permalink: progress/playback-check-respektiert-jetzt-browser-unmute-policy
tags:
- progress
- player
- audio
- bugfix
- mvp
---

# Umgesetzter Fortschritt

Der Playback-Check versucht das programmgesteuerte Entmuten jetzt erst nach echter Benutzerinteraktion im Tab.

## Problem
- Browser blockieren das Unmuten automatisch geoeffneter Tabs ohne vorherige Interaktion mit dem Dokument
- Dadurch entstand der Fehler, dass Unmute scheiterte und stattdessen nur ein Pause-Effekt gemeldet wurde

## Umsetzung
- Das Content-Script trackt echte Interaktion im Tab (`pointerdown`, `keydown`, `touchstart`, `mousedown`)
- Zusaetzlich wird `navigator.userActivation.hasBeenActive` beruecksichtigt, falls verfuegbar
- Ohne Interaktion versucht der Playback-Check weiter das Resume eines pausierten Players, aber noch kein Unmute
- Erst nach Interaktion wird ein stummgeschalteter Player auf `1%` angehoben

## Zusatz
- Extension-Version wurde als Patch auf `0.6.2` erhoeht