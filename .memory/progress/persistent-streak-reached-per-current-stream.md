---
title: persistent-streak-reached-per-current-stream
type: note
permalink: progress/persistent-streak-reached-per-current-stream
---

## Umgesetzt
- Persistenter Status für "Streak in diesem aktuellen Stream bereits erhöht" eingeführt.
- Speicherung erfolgt pro Channel in `broadcastSessionsByChannel` als `streakIncreasedForStream`.
- Reset erfolgt automatisch bei erkanntem Broadcast-Neustart.
- Popup-Checkmark basiert nun auf `streakIncreasedForStream` statt nur auf transientem `watchStreak.increased`.

## Effekt
- Nach Page-Reload oder Extension-Reload bleibt sichtbar, ob für den aktuell laufenden Stream das Streak-Ziel schon erreicht wurde.
- Bei neuem Stream startet der Status wieder sauber ohne Checkmark.