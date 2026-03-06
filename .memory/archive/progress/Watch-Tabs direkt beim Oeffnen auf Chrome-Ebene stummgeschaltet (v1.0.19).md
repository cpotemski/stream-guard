---
title: Watch-Tabs direkt beim Oeffnen auf Chrome-Ebene stummgeschaltet (v1.0.19)
type: progress
permalink: progress/watch-tabs-direkt-beim-oeffnen-auf-chrome-ebene-stummgeschaltet-v1.0.19-1
status: historical
version: 1.0.19
---

## Umsetzung
- Neue Watch-Tabs werden direkt mit `muted: true` erstellt (`chrome.tabs.create`), also auf Chrome-Tab-Ebene.
- Fallback eingebaut: Wenn ein neu erstellter Tab wider Erwarten nicht stumm ist, wird sofort `chrome.tabs.update(tabId, { muted: true })` nachgezogen.
- Reconcile-Haertung bleibt aktiv: Bestehende gemanagte Tabs werden weiterhin regelmaessig auf Tab-Mute geprueft und bei Bedarf stummgeschaltet.

## Wirkung fuer v1
- Keine Twitch-Player-Mute-Abhaengigkeit fuer die Audio-Unterdrueckung mehr.
- Robustes 24/7-Verhalten: Sowohl neue als auch bestehende Watch-Tabs bleiben auf Browser-Ebene stumm.