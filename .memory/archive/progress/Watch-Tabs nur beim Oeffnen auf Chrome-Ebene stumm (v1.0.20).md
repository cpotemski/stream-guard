---
title: Watch-Tabs nur beim Oeffnen auf Chrome-Ebene stumm (v1.0.20)
type: progress
permalink: progress/watch-tabs-nur-beim-oeffnen-auf-chrome-ebene-stumm-v1.0.20
status: historical
version: 1.0.20
---

## Umsetzung
- Watch-Tabs werden ausschliesslich beim Erstellen per `chrome.tabs.create(..., { muted: true })` stumm geöffnet.
- Kein Nachzieh-Fallback mehr per `chrome.tabs.update(..., { muted: true })`.
- Keine Reconcile-Mute-Absicherung mehr im Tab-Lifecycle.

## Wirkung fuer v1
- Tab-Muting erfolgt klar und minimal auf Chrome-Ebene beim Öffnen neuer Watch-Tabs.
- Twitch-Player-Logik bleibt davon getrennt.