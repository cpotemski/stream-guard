---
title: Popup zeigt jetzt Debug State und Reconcile-Log
type: note
permalink: progress/popup-zeigt-jetzt-debug-state-und-reconcile-log
tags:
- progress
- debugging
- mvp
---

# Umgesetzter Fortschritt

Zur Fehlersuche zeigt das Popup jetzt den aktuellen Runtime-State und einen kleinen persistierten Debug-Log aus dem Background-Worker an.

## Inhalt
- aktueller `runtimeState`
- letzte Reconcile-Events mit Zeitstempel
- Gruende fuer oeffnen, schliessen, ueberspringen und Reset

## Zweck
- reproduzierbare Tab-Probleme koennen jetzt ohne Browser-Remote-Debugging sichtbar gemacht werden
- der konkrete Schliesspfad ist nach `Open Watch Group` direkt im Popup nachvollziehbar

## Zusatz
- Extension-Version wurde als Patch auf `0.1.6` erhoeht