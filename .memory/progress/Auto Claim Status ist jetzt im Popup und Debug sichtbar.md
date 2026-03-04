---
title: Auto Claim Status ist jetzt im Popup und Debug sichtbar
type: note
permalink: progress/auto-claim-status-ist-jetzt-im-popup-und-debug-sichtbar
tags:
- progress
- auto-claim
- popup
- debug
- mvp
---

# Umgesetzter Fortschritt

Der Auto-Claim-Pfad ist jetzt nicht nur zaehlbar, sondern auch direkt beobachtbar.

## Umsetzung
- Runtime-State fuehrt jetzt zusaetzlich `claimAvailabilityByChannel`
- Das Content-Script meldet, ob aktuell eine claimbare Truhe sichtbar ist
- Der Background speichert diesen Status nur fuer tatsaechlich verwaltete Watch-Tabs
- Im Debug erscheinen dazu `claim:available` und `claim:cleared`
- Im Popup wird eine aktuell sichtbare Truhe pro Channel kompakt mit `🟡` angezeigt
- Nach erfolgreichem Claim oder Session-Reset wird der sichtbare Claim-Status wieder geleert

## Wirkung
- Auto-Claim laesst sich jetzt deutlich einfacher live nachvollziehen
- Man sieht sofort, ob gerade etwas claimbar ist, auch bevor der Counter steigt

## Zusatz
- Extension-Version wurde als Patch auf `0.5.2` erhoeht