---
title: "Stop/Start behaelt Broadcast-gebundene Stats bei (v1.0.2)"
type: note
permalink: progress/stop-start-behaelt-broadcast-gebundene-stats-bei-v1.0.2
status: active
---

# Umsetzung
- `watch:stop` leert keine Broadcast-gebundenen Felder mehr (`broadcastSessionsByChannel`, `lastBroadcastStatsByChannel`, `claimStatsByChannel`, `watchStreakByChannel`).
- `watch:start` fuehrt keinen harten Runtime-Reset mehr aus.
- Ergebnis: Bei kurzem Off/On (z. B. vor Extension-Reload) bleiben Reward-Count und Streak am gleichen Broadcast erhalten.

# Version
- `extension/manifest.json` auf `1.0.2` erhoeht.
