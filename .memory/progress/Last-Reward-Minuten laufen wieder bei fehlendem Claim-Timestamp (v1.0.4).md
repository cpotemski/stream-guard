---
title: Last-Reward-Minuten laufen wieder bei fehlendem Claim-Timestamp (v1.0.4)
type: note
permalink: progress/last-reward-minuten-laufen-wieder-bei-fehlendem-claim-timestamp-v1.0.4
status: active
tags:
- v1
- bugfix
- popup
- claims
---

# Problem
Die Minutenanzeige seit letztem Reward blieb auf `0min`, wenn fuer einen (neu/retained) Broadcast kein gueltiger `lastClaimAt` vorhanden war.

# Umsetzung
- Fallback in der Reconcile-Initialisierung: wenn `retainedLastClaimAt` fehlt/0 ist, wird `Date.now()` gesetzt.
- Dadurch laeuft die Minutenanzeige wieder statt dauerhaft `0min` zu bleiben.

# Version
- `extension/manifest.json` auf `1.0.4` erhoeht.