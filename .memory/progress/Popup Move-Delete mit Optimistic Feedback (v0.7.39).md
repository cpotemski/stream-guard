---
title: Popup Move/Delete mit Optimistic Feedback (v0.7.39)
type: progress
permalink: progress/popup-move-delete-mit-optimistic-feedback-v0.7.39
tags:
- mvp
- popup
- ux
---

## Kontext
Im Popup fuehlten sich Umsortieren und Loeschen verzoegert an, da die UI erst nach abgeschlossenem `settings:update` + `refresh()` sichtbar aktualisiert wurde.

## Entscheidung (YAGNI/MVP)
Keine Architektur-Erweiterung im Background. Stattdessen direkter, optimistischer Listen-Update im Popup mit Rollback bei Fehlern.

## Umsetzung
- `extension/src/popup.js`
  - Neuer gemeinsamer Update-Pfad `updateImportantChannels(channels)` fuer Move/Delete.
  - Optimistisches Update: `latestSnapshot.settings.importantChannels` wird sofort gesetzt und gerendert.
  - Fehlerfall: Ruecksetzen auf vorherige Channel-Liste.
  - `settingsUpdateInFlight` verhindert konkurrierende Klicks waehrend laufendem Request.
  - Controls sind waehrend In-Flight deaktiviert (klares direktes Feedback).
- `extension/manifest.json`
  - Version auf `0.7.39` erhoeht.

## MVP-Risiko
- Bei transienten Fehlern kann es kurz zu sichtbarem Rollback kommen (beabsichtigtes Verhalten zur Konsistenz).