---
title: Slot-Modell verworfen zugunsten dynamischer Live-Tabs
type: decision
permalink: decisions/slot-modell-verworfen-zugunsten-dynamischer-live-tabs
tags:
- mvp
- yagni
- watch-tabs
---

# Entscheidung

Das feste 3-Slot-Modell wird wieder entfernt.

## Neue verbindliche Richtung

- Bei aktivem Watch-Lauf werden Tabs nur für aktuell live priorisierte Channels geöffnet.
- Wenn ein verwalteter Channel offline geht oder ein Tab auf einen anderen Channel wechselt (z. B. Raid), wird der verwaltete Tab geschlossen.
- Alle von der Extension geöffneten Watch-Tabs bleiben in der bestehenden TabGroup `TW Watch`.

## Begründung

- Entspricht direkter dem MVP-Ziel und ist die einfachere robuste Lösung.
- Reduziert Zustandskomplexität (`watchSlots`) und UI-Overhead.
- YAGNI: keine künstlichen Slot-Abstraktionen ohne unmittelbaren MVP-Mehrwert.

## Ersetzt

- Die Slot-Richtung aus `progress/watch-start-nutzt-jetzt-3-feste-slot-tabs-in-der-watch-group` wird damit fachlich ersetzt.