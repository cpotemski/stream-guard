---
title: Streak-Parser auf Primary-Fallback umgestellt und gehaertet (v1.0.13)
type: progress
permalink: progress/streak-parser-auf-primary-fallback-umgestellt-und-gehaertet-v1-0-13
status: active
affected_version: 1.0.13
date: 2026-03-06
---

# Umsetzung
- Streak-Erkennung in `content.js` auf zentrale Dual-Parser-Orchestrierung umgestellt (`primary -> fallback`).
- Primary-Parser fuer die neue Watch-Streak-Variante ueber `#watch-streak-footer` bzw. `aria-controls` eingefuehrt.
- Legacy-Parser beibehalten, aber Extraktion auf bevorzugte Header-Knoten verengt (keine breite globale Zahlensuche mehr).
- Integer-Parsing gehaertet:
  - strikter Zahlentoken-Parser mit Tausender-Trennzeichen-Unterstuetzung
  - keine feste Maximalgrenze mehr
- Fehlzahlschutz erweitert:
  - Reward-/Cost-Bereiche und Points/Bits-Bereiche explizit ausgeschlossen.

# Diagnose-Events
- Neu: `streak-primary-used`
- Neu: `streak-fallback-used`
- Neu: `streak-parser-conflict`
- Neu: `streak-no-valid-candidate`

# Geaenderte Dateien
- `extension/src/content.js`
- `extension/manifest.json`

# Version
- `extension/manifest.json` von `1.0.12` auf `1.0.13` erhoeht.
