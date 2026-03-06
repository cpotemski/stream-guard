---
title: Stop-Start behaelt Broadcast-Stats bei (v1.0.2)
type: note
permalink: progress/stop-start-behaelt-broadcast-stats-bei-v1.0.2
status: active
tags:
- v1
- bugfix
- broadcast
- claims
- streak
---

# Problem
Beim Workflow `watch:stop` -> Extension Reload -> `watch:start` wurden Reward-Count und Streak fuer laufende Broadcasts zurueckgesetzt.

# Umsetzung
- `watch:stop` laesst Broadcast-gebundene Runtime-Felder stehen.
- `watch:start` fuehrt keinen harten Reset mehr aus, sondern startet direkt Reconcile.

# Ergebnis
- Bei kurzem Off/On und gleichem Broadcast bleiben Reward-Count, Last-Claim-Zeit und Streak-Kontext erhalten.

# Version
- `extension/manifest.json` auf `1.0.2` angehoben.