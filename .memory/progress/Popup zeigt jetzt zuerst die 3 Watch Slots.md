---
title: Popup zeigt jetzt zuerst die 3 Watch Slots
type: note
permalink: progress/popup-zeigt-jetzt-zuerst-die-3-watch-slots
tags:
- progress
- popup
- ui
- slots
- mvp
---

# Umgesetzter Fortschritt

Das Popup stellt jetzt die 3 Watch-Slots als primaere Ansicht ueber der Prioritaetenliste dar.

## Umsetzung
- Neue obere Slot-Sektion mit genau 3 Slots
- Jeder Slot zeigt seinen Zustand (`aktiv` oder `leer`)
- Zugewiesene Streamer werden in den Slots mit ihren laufenden Stats angezeigt
- `👆` bleibt direkt am Slot sichtbar, wenn dieser Tab noch keine Interaktion hatte
- Die untere Liste ist jetzt bewusst nur noch die priorisierte Streamer-Liste mit Sortierung und ohne laufende Session-Stats

## Wirkung
- Laufende Watch-Infos sitzen jetzt dort, wo sie logisch hingehoeren: bei den echten Watch-Slots
- Die Prioritaetenliste bleibt schlank und dient primär als Reihenfolge-Steuerung

## Zusatz
- Extension-Version wurde als Patch auf `0.7.1` erhoeht