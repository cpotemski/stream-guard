---
title: Streak-Baseline wird jetzt beim Streamstart aktiv angefragt (v0.7.32)
type: note
permalink: progress/streak-baseline-wird-jetzt-beim-streamstart-aktiv-angefragt-v0.7.32
tags:
- streak
- uptime
- background
- content-script
- mvp
---

# Streak-Baseline wird jetzt beim Streamstart aktiv angefragt (v0.7.32)

## Aenderung
- Der Background sendet beim erkannten Streamstart (`watch:uptime-init`) sofort eine Anfrage an den Content-Tab, den Streak-Wert direkt zu lesen (`watch:request-streak`).
- Dasselbe passiert bei erkanntem Stream-Neustart (`watch:session-reset`).
- Dadurch liegt frueh im Stream eine Baseline vor, statt auf den naechsten 5-Minuten-Tick zu warten.

## Content-Script
- Neuer Message-Handler fuer `watch:request-streak`, der `reportWatchStreak()` direkt triggert.
- Nebenbei korrigiert: Streak-Read wird nicht mehr in jedem `syncButton()`-Tick (1s) aufgerufen, sondern nur noch
  - beim Channelwechsel initial,
  - im 5-Minuten-Intervall,
  - auf explizite Background-Anfrage.

## Version
- `extension/manifest.json` auf `0.7.32` (Patch) erhoeht.

## MVP-Wirkung
- Kein Scope-Drift: nur Timing-/Trigger-Verbesserung fuer bestehende Streak-Logik.
- Ziel erreicht: Bessere Vergleichbarkeit, ob die Streak im Verlauf eines Streams steigt.