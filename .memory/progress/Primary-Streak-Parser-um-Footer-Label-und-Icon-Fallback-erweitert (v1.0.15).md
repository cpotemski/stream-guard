---
title: Primary Streak-Parser um Footer-Label und Icon-Fallback erweitert (v1.0.15)
type: progress
permalink: progress/primary-streak-parser-um-footer-label-und-icon-fallback-erweitert-v1-0-15
status: active
affected_version: 1.0.15
date: 2026-03-06
---

# Problem
In einem weiteren Twitch-UI-Layout fehlte `#watch-streak-footer` zeitweise.
Damit blieb `hadPrimaryContainer:false` und kein Streak-Wert wurde erkannt.

# Umsetzung
- Primary-Container-Suche erweitert um:
  - `label[for=<input id>]` zu `input[aria-controls]` mit Watch-Streak-Icon
  - generische `label`-Treffer mit Watch-Streak-Icon und parsebarer Zahl
  - Icon-basierter Fallback-Container im Dialog (nahe am Watch-Streak-Icon, mit parsebarer Zahl)

# Ergebnis
Wenn die Footer-Card fehlt, kann der Primary-Parser den unteren Reward-Center-Bereich (z. B. `556` neben 🔥) trotzdem lesen.

# Geaenderte Dateien
- `extension/src/content.js`
- `extension/manifest.json`

# Version
- `extension/manifest.json` von `1.0.14` auf `1.0.15` erhoeht.
