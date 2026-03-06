---
title: Reward-Center schliessen primaer ueber Close-Icon statt Toggle (v1.0.16)
type: progress
permalink: progress/reward-center-schliessen-primaer-ueber-close-icon-statt-toggle-v1-0-16
status: active
affected_version: 1.0.16
date: 2026-03-06
---

# Umsetzung
- Close-Flow fuer das Reward-Center angepasst:
  - Kein Schliessen mehr ueber den Summary-Toggle-Button.
  - Schliessen erfolgt ueber das Close-Icon.
  - Falls das Close-Icon nicht greift, bleibt `Escape` als Notfall-Fallback aktiv.

# Grund
Im neueren Twitch-Layout ist das Schliessen ueber den unteren Toggle nicht zuverlaessig.

# Geaenderte Dateien
- `extension/src/content.js`
- `extension/manifest.json`

# Version
- `extension/manifest.json` von `1.0.15` auf `1.0.16` erhoeht.
