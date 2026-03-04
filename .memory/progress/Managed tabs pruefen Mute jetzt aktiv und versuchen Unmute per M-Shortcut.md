---
title: Managed tabs pruefen Mute jetzt aktiv und versuchen Unmute per M-Shortcut
type: progress
permalink: progress/managed-tabs-pruefen-mute-jetzt-aktiv-und-versuchen-unmute-per-m-shortcut
tags:
- mvp
- playback
- unmute
---

## Kontext
Beim Test war der Twitch-Player in verwalteten Watch-Tabs nach Reload weiterhin auf mute, wodurch Claims erst nach manuellem Eingriff sicher liefen.

## Umsetzung (MVP)
- `ensureManagedPlaybackState()` fuehrt weiterhin alle 5s den Playback-Check aus.
- Wenn `video.muted` oder `volume <= 0` erkannt wird, versucht die Extension jetzt aktiv zu korrigieren in dieser Reihenfolge:
  1. `m`-Shortcut per Keyboard-Event auf den Player-Kontext
  2. Fallback: Klick auf den Twitch-Mute/Unmute-Button
  3. Letzter Fallback (wie bisher, nur bei sicherer Browser-User-Activation): direkt `video.muted = false` und minimale Lautstaerke setzen
- `watch:playback-corrected` wird nur gesendet, wenn der Zustand danach wirklich nicht mehr mute ist.

## Entscheidung
- YAGNI: kein neuer globaler Scheduler, keine neue Hintergrund-Architektur.
- Wir nutzen den bestehenden 5s-Loop im Content-Script und erweitern nur die Korrekturlogik minimal.

## Versionierung
- Extension-Version auf `0.7.3` erhoeht (Patch).