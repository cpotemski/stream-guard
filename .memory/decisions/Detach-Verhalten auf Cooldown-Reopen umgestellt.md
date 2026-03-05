---
title: Detach-Verhalten auf Cooldown-Reopen umgestellt
type: decision
permalink: decisions/detach-verhalten-auf-cooldown-reopen-umgestellt
tags:
- decision
- v1
- recovery
- tabs
---

# Entscheidung
Das bisherige Verhalten "detach blockiert Reopen bis offline" wird ersetzt durch ein zeitbasiertes Cooldown-Reopen.

## Neue Regel
- Bei Channel-Mismatch/Detach wird der betroffene Channel fuer eine kurze Cooldown-Zeit vom automatischen Reopen ausgenommen.
- Nach Ablauf des Cooldowns darf der Channel wieder automatisch geoeffnet werden, auch wenn er weiterhin live ist.

## Begruendung
- Das alte Verhalten konnte bei lang laufenden Streams zu dauerhaftem Nicht-Wiederoeffnen fuehren.
- Fuer v1-24/7 ist ein selbstheilendes Reopen-Verhalten zwingend.
- Der Cooldown verhindert trotzdem aggressive Reopen-Loops direkt nach Redirect/Detach.