---
title: Primary-Parser liest Watch-Streak direkt aus strong Footer-Badge (v1.0.18)
type: progress
permalink: progress/primary-parser-liest-watch-streak-direkt-aus-strong-footer-badge-v1-0-18
status: active
affected_version: 1.0.18
date: 2026-03-06
---

# Problem
Im neuen Reward-Center-Layout wurde teils `streak 0` erkannt, obwohl das Watch-Streak-Badge im Footer einen gueltigen Wert (z. B. `556`) enthielt.

# Umsetzung
- Expliziter Primary-Pfad fuer das Footer-Badge eingefuehrt:
  - `input[aria-controls='watch-streak-footer']`
  - zugehoeriges `label[for=<input.id>]`
  - Wert direkt aus `strong` innerhalb dieses Labels
- Breiter Text-Fallback im Primary-Pfad entfernt, um Fehltreffer auf `0` zu vermeiden.

# Ergebnis
Der neue Layout-Pfad liest den Streak-Wert deterministisch aus dem kleinen `strong`-Badge neben dem Flammen-Icon.

# Geaenderte Dateien
- `extension/src/content.js`
- `extension/manifest.json`

# Version
- `extension/manifest.json` von `1.0.17` auf `1.0.18` erhoeht.
