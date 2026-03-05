---
title: short-outage-retention-for-stream-session-state
type: note
permalink: decisions/short-outage-retention-for-stream-session-state
---

## Entscheidung
Bei kurzfristigen Stream-Ausfällen werden Broadcast-/Streak-Sessiondaten nicht sofort gelöscht.

## Umsetzung
- Neue Retention-Grenze: `15 Minuten` (`BROADCAST_SESSION_RETENTION_MS = 900000`).
- `broadcastSessionsByChannel` enthält jetzt zusätzlich `lastSeenAt`.
- Aufräumen von `broadcastSessionsByChannel` und `watchStreakByChannel` erfolgt nur, wenn die Retention überschritten ist.
- Beim Wiederöffnen eines Tabs für denselben Channel bleibt eine noch frische Broadcast-Session erhalten, inklusive `streakIncreasedForStream`.

## Zielbezug
Kurze Unterbrechungen (<15 min) verlieren nicht sofort den Status "Streak in diesem Stream bereits erreicht".