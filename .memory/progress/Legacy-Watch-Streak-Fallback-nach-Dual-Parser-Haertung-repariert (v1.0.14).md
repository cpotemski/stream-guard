---
title: Legacy Watch-Streak Fallback nach Dual-Parser-Haertung repariert (v1.0.14)
type: progress
permalink: progress/legacy-watch-streak-fallback-nach-dual-parser-haertung-repariert-v1-0-14
status: active
affected_version: 1.0.14
date: 2026-03-06
---

# Problem
Die erste Dual-Parser-Haertung konnte die Legacy-Variante der Watch-Streak-Karte blockieren.
Ursache war ein zu breiter Exclude-Selector (`.rewards-list`), der den Legacy-Streak-Bereich mit ausgeschlossen hat.

# Umsetzung
- Exclude-Selector praezisiert: `.rewards-list` nicht mehr global ausschliessen.
- Legacy-Extraktion auf den Card-Bereich verengt (`extractIntegerFromPreferredRegion(card)` als Primary im Legacy-Pfad).
- Header-basierter Fallback bleibt bestehen.

# Ergebnis
Die Legacy-Variante (z. B. `Your Watch Streak: 10`) wird wieder erkannt, ohne Reward-Cost-Zahlen als Streak zu parsen.

# Geaenderte Dateien
- `extension/src/content.js`
- `extension/manifest.json`

# Version
- `extension/manifest.json` von `1.0.13` auf `1.0.14` erhoeht.
