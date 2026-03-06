---
title: Reward-Center Close ohne ESC-Fallback (v1.0.17)
type: progress
permalink: progress/reward-center-close-ohne-esc-fallback-v1-0-17
status: active
affected_version: 1.0.17
date: 2026-03-06
---

# Umsetzung
- `Escape` wurde aus dem Reward-Center-Close-Flow entfernt.
- Schliessen erfolgt jetzt ausschliesslich ueber das Close-Icon.

# Grund
Im betroffenen Layout greift der ESC-Fallback nicht zuverlaessig und soll nicht verwendet werden.

# Geaenderte Dateien
- `extension/src/content.js`
- `extension/manifest.json`

# Version
- `extension/manifest.json` von `1.0.16` auf `1.0.17` erhoeht.
