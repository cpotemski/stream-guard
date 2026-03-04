---
title: Watch Start nutzt jetzt 3 feste Slot Tabs in der Watch Group
type: note
permalink: progress/watch-start-nutzt-jetzt-3-feste-slot-tabs-in-der-watch-group
tags:
- progress
- architecture
- watch-tabs
- mvp
---

# Umgesetzter Fortschritt

Die erste Etappe des Slot-Umbaus ist umgesetzt: `watch:start` arbeitet jetzt mit 3 festen Watch-Slots in der Watch-Tabgroup statt mit neu geoeffneten Channel-Tabs.

## Umsetzung
- `tabManager` stellt jetzt eine feste Watch-Group mit genau 3 Tabs sicher
- Diese Tabs werden als `watchSlots` im Runtime-State gefuehrt
- Jeder Slot fuehrt `slotId`, `tabId`, zugewiesenen `channel` und `hasInteracted`
- `watch:start` erstellt oder uebernimmt diese 3 Slots und oeffnet keine neuen Channel-Tabs mehr
- `watch:stop` behaelt die Slot-Tabs bei und leert nur die Zuweisungen
- Der Reconcile-Pfad weist Live-Channels freien Slots zu und navigiert bestehende Slot-Tabs auf den Ziel-Channel
- Das Popup zeigt pro Channel jetzt den zugewiesenen Slot (`#1` bis `#3`) und mit `👆`, wenn dieser Slot noch keine echte Interaktion hatte
- Das Content-Script meldet die erste echte Interaktion im jeweiligen Slot-Tab an den Background

## Bedeutung
- Die Extension beginnt damit, von einem dynamischen Tab-Modell auf ein festes Slot-Modell umzusteigen
- Die drei Watch-Tabs bleiben damit als stabiler Container erhalten und koennen langfristig die Browser-Policy-Probleme besser abfedern

## Zusatz
- Extension-Version wurde als Minor auf `0.7.0` erhoeht