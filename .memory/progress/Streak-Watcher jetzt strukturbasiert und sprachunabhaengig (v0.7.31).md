---
title: Streak-Watcher jetzt strukturbasiert und sprachunabhaengig (v0.7.31)
type: note
permalink: progress/streak-watcher-jetzt-strukturbasiert-und-sprachunabhaengig-v0.7.31
tags:
- streak
- content-script
- popup
- background
- mvp
---

# Streak-Watcher jetzt strukturbasiert und sprachunabhaengig (v0.7.31)

## Umsetzung
- `extension/src/content.js` erweitert um separaten Streak-Check alle 5 Minuten (`WATCH_STREAK_POLL_INTERVAL_MS = 300000`).
- Das Reward-Menue wird ueber den **inneren Button** im Container `div[data-test-selector="community-points-summary"]` geoeffnet/geschlossen.
- Der Probe-Flow schliesst das Menue nach der Erfassung immer wieder, damit die Truhe sichtbar bleibt.
- Streak-Erkennung im Reward Center ist strukturbasiert:
  - Dialog ueber `role="dialog"` + Reward-Center-Anker.
  - Card-Erkennung ueber Watch-Streak-Icon-Path (Flame) mit Fallback auf Progressbar+Chevron-Struktur.
  - Keine feste Abhaengigkeit von lokalisiertem UI-Text fuer das Finden der Card.
- Neuer Message-Typ `streak:report` von Content -> Background.
- `extension/src/background.js` verarbeitet `streak:report` nur fuer gemanagte Tabs, dedupliziert auf Wert und schreibt `watchStreakByChannel`.
- `extension/src/lib/storage.js` erweitert um `watchStreakByChannel` inklusive Normalisierung.
- `extension/src/popup.js` zeigt pro Channel ein kleines Streak-Label (`🔥 S{value}`).
- `extension/src/styles.css` erweitert um `.channel-streak`.
- `extension/manifest.json` auf `0.7.31` (Patch) angehoben.

## MVP-Einordnung
- Claim-Intervall unveraendert.
- Streak-Check separat und sparsam alle 5 Minuten.
- Keine neue Architektur, nur minimale Runtime-State-Erweiterung (YAGNI-konform).

## Risiko
- Twitch kann SVG-Path/DOM-Struktur aendern; dann muessen die strukturbasierten Selektoren angepasst werden.