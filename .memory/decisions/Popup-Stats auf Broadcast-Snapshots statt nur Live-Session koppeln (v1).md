---
title: Popup-Stats auf Broadcast-Snapshots statt nur Live-Session koppeln (v1)
type: note
permalink: decisions/popup-stats-auf-broadcast-snapshots-statt-nur-live-session-koppeln-v1
status: active
date: 2026-03-05
version: 0.7.69
---

## Entscheidung
Claim- und Streak-Informationen werden an Broadcast-Snapshots gekoppelt (`broadcastSessionsByChannel` + `lastBroadcastStatsByChannel`) statt nur an fluechtige Live-Session-Maps.

## Grund
- Popup war bei Offline/Detach-Phasen nicht immer konsistent.
- Werte gingen verloren, wenn Managed Tabs geschlossen oder Broadcast-Retention ablief.

## Konsequenz
- Popup kann Stats auch aus dem letzten bekannten Broadcast anzeigen.
- Claim/Streak bleiben pro Broadcast nachvollziehbar, auch wenn der Channel zwischenzeitlich offline ist.