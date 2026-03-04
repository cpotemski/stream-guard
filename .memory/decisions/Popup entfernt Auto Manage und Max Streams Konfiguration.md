---
title: Popup entfernt Auto Manage und Max Streams Konfiguration
type: note
permalink: decisions/popup-entfernt-auto-manage-und-max-streams-konfiguration
tags:
- decision
- mvp
- popup
- yagni
---

# Verbindliche Entscheidung

Das Popup fuehrt keine direkte Konfiguration fuer `autoManage` und `maxStreams` mehr.

## Entscheidung
- Der `autoManage`-Schalter wird aus dem Popup entfernt, weil `Open Watch Group` und `Stop & Close` denselben Zustand bereits direkt steuern.
- Die `Max Streams`-Auswahl wird ebenfalls aus dem Popup entfernt, um die UI auf den unmittelbaren MVP-Kern zu reduzieren.
- Der Untertitel im Popup entfaellt ebenfalls.
- Die Buttons `Open Watch Group` und `Stop & Close` bleiben bestehen, weil sie weiterhin die zentrale explizite Start-/Stop-Steuerung fuer den Watch-Lauf bilden.

## Begruendung
- Der `autoManage`-Schalter war funktional redundant.
- Eine schlankere Popup-Oberflaeche passt besser zu den MVP- und YAGNI-Leitplanken.
- Die Start-/Stop-Aktion bleibt als klare Nutzerkontrolle notwendig.

## Zusatz
- Extension-Version wurde als Patch auf `0.2.1` erhoeht