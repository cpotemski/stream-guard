---
title: Popup Start Stop ist jetzt Header Toggle Slider
type: note
permalink: progress/popup-start-stop-ist-jetzt-header-toggle-slider
tags:
- progress
- popup
- ui
- mvp
- toggle
---

# Umgesetzter Fortschritt

Die Watch-Steuerung im Popup wurde von zwei Buttons auf einen echten Toggle-Slider im Header umgestellt.

## Umsetzung
- `Open Watch Group` und `Stop & Close` wurden aus dem unteren Bereich entfernt
- Stattdessen gibt es oben rechts im Header einen kompakten Ein/Aus-Slider
- `Ein` triggert weiterhin `watch:start`
- `Aus` triggert weiterhin `watch:stop`
- Der Slider spiegelt beim Rendern den aktuellen `autoManage`-Zustand

## Wirkung
- Die Hauptsteuerung ist kompakter und klarer als zuvor
- Der Start-/Stop-Mechanismus bleibt funktional identisch, nur die Bedienform ist jetzt opinionierter und platzsparender

## Zusatz
- Extension-Version wurde als Patch auf `0.2.3` erhoeht