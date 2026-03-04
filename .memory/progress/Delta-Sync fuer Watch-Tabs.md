---
title: Delta-Sync fuer Watch-Tabs
type: note
permalink: progress/delta-sync-fuer-watch-tabs
tags:
- progress
- tabs
- mvp
---

# Umgesetzter Fortschritt

Die Watch-Tab-Verwaltung nutzt jetzt ein Channel-zu-Tab-Mapping statt bei jedem Tick alle Tabs zu schliessen und neu zu oeffnen.

## Umsetzung
- Runtime-State speichert `managedTabsByChannel`
- Reconcile schliesst nur Tabs fuer Channels, die nicht mehr live oder nicht mehr gewuenscht sind
- Bereits korrekte Tabs bleiben offen und werden wiederverwendet
- Wenn ein verwalteter Tab nicht mehr auf den erwarteten Channel zeigt (zum Beispiel nach Redirect oder Raid), wird dieser Tab geschlossen und aus dem Mapping entfernt
- Neue Tabs werden nur fuer fehlende, live priorisierte Channels geoeffnet

## Nebenwirkung fuer UX
- Deutlich weniger Tab-Flackern und kein minutenweises Komplett-Neuaufbauen mehr
- Nach Offline oder Redirect wird der betroffene Tab entfernt

## Zusatz
- Default fuer `maxStreams` ist jetzt `3`
- Extension-Version wurde als Patch auf `0.1.3` erhoeht