---
title: Stern in gemeinsame Header-Card mit Inline-Stats integriert (v1.0.6)
type: progress
permalink: progress/stern-in-gemeinsame-header-card-mit-inline-stats-integriert-v1.0.6
status: active
affected_version: 1.0.6
---

# Kontext
Die Inline-Stats standen bisher neben dem Stern als separates Badge.

# Umsetzung
- Stern und Stats wurden in eine gemeinsame kompakte Header-Card integriert.
- Inaktiv (Stern aus): Card zeigt nur den Stern.
- Aktiv (Stern an): Card zeigt Stern plus Stats rechts daneben.
- Beim Toggle wird die Card sofort neu gerendert (kein Warten auf Poll-Intervall).

# Geaenderte Dateien
- `extension/src/content.js`
- `extension/src/styles.css`
- `extension/manifest.json` (Version auf 1.0.6)

# Ergebnis
Die Twitch-Header-Einbindung wirkt kompakter und konsistenter; Bedienlogik bleibt unveraendert.