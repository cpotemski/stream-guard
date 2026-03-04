---
title: Bugfix Popup-Sortierung
type: note
permalink: progress/bugfix-popup-sortierung
tags:
- progress
- bugfix
- popup
- versioning
---

# Bugfix: Popup-Sortierung

## Ursache
Die Reihenfolge im Popup wurde beim Klick auf die Pfeile zwar lokal umgestellt, beim Speichern aber wieder anhand der alten `priority`-Werte sortiert.
Dadurch blieb die sichtbare Reihenfolge effektiv unveraendert.

## Fix
- Die Normalisierung der `importantChannels` behandelt eine explizit uebergebene Liste jetzt nach ihrer Array-Reihenfolge.
- Alte Priority-Werte werden in diesem Fall nicht mehr benutzt, sondern neu von oben nach unten vergeben.

## Version
- Extension-Version von `0.1.0` auf `0.1.1` erhoeht.
- SemVer: Patch-Bump fuer einen rueckwaertskompatiblen Bugfix.
