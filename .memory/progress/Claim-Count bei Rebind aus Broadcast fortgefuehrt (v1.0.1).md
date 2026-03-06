---
title: Claim-Count bei Rebind aus Broadcast fortgefuehrt (v1.0.1)
type: note
permalink: progress/claim-count-bei-rebind-aus-broadcast-fortgefuehrt-v1.0.1
status: active
tags:
- v1
- claims
- broadcast
- bugfix
---

# Umsetzung
- In der Tab-Reconcile-Logik wird `claimStatsByChannel` bei fehlender Runtime-Claim-Session jetzt aus der gehaltenen Broadcast-Session (`claimCount`, `lastClaimAt`) initialisiert statt pauschal auf `0`.
- Damit bleibt der Reward-Count an den Broadcast gekoppelt, auch wenn Tabs neu gebunden/geoeffnet werden und ein Broadcast noch als laufend/recent gilt.

# Version
- `extension/manifest.json` auf `1.0.1` erhoeht.