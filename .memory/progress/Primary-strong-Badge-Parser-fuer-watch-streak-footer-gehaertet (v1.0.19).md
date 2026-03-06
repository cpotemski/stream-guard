---
title: Primary strong-Badge Parser fuer watch-streak-footer gehaertet (v1.0.19)
type: progress
permalink: progress/primary-strong-badge-parser-fuer-watch-streak-footer-gehaertet-v1-0-19
status: active
affected_version: 1.0.19
date: 2026-03-06
---

# Umsetzung
- Primary-Parser fuer das Footer-Badge weiter verengt und robuster gemacht:
  - Eingangsmenge: `input[aria-controls*='watch-streak-footer']`
  - Wertquelle: zugehoeriges `label[for=<input.id>] strong`
- Icon-Abhaengigkeit im Footer-Badge-Pfad entfernt.
- Dadurch wird auch `0` aus dem `strong`-Badge deterministisch gelesen.

# Grund
Im betroffenen Layout ist der Streak-Wert als kleines `strong`-Badge im Reward-Center-Footer vorhanden und soll genau dort ausgelesen werden.

# Geaenderte Dateien
- `extension/src/content.js`
- `extension/manifest.json`

# Version
- `extension/manifest.json` von `1.0.18` auf `1.0.19` erhoeht.
