---
title: Watch-Tabs ueber Create+direktes Update auf Chrome-Ebene stumm (v1.0.21)
type: progress
permalink: progress/watch-tabs-ueber-create-direktes-update-auf-chrome-ebene-stumm-v1.0.21
status: active
version: 1.0.21
---

## Umsetzung
- `chrome.tabs.create` erfolgt ohne `muted`-Property, damit das Oeffnen stabil funktioniert.
- Direkt danach wird der neu erzeugte Tab per `chrome.tabs.update(tabId, { muted: true })` auf Chrome-Ebene stumm geschaltet.
- Keine Twitch-Player-Mute-Steuerung als primaerer Mechanismus.

## Wirkung fuer v1
- Tabs werden wieder zuverlaessig erstellt.
- Audio bleibt auf Browser-Tab-Ebene gedrosselt, ohne Twitch-Player-Muting als Kernpfad.