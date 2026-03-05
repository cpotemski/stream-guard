---
title: Popup zeigt Streak-Fortschritt mit Checkmark (v0.7.36)
type: note
permalink: progress/popup-zeigt-streak-fortschritt-mit-checkmark-v0.7.36
---

## Kontext
MVP-Ziel: Auf einen Blick sehen, ob die Stream-Serie (Watch Streak) erfolgreich weitergefuehrt wurde.

## Verbindliche Entscheidung (MVP/YAGNI)
Bei einer erkannten Erhoehung des Streak-Werts zeigt das Popup hinter der Streak ein `✅`.

## Umsetzung
- Background (`updateWatchStreak`): setzt pro Channel ein `increased`-Flag, wenn neuer Wert > vorheriger Wert.
- Storage-Normalisierung erweitert um Feld `increased` in `watchStreakByChannel`.
- Popup rendert Streak als:
  - `🔥 <wert> ✅` bei `increased === true`
  - `🔥 <wert>` sonst.

## Verhalten
- Das Checkmark signalisiert: seit dem letzten bekannten Wert wurde ein echter Fortschritt erkannt.
- Bei gleichbleibender oder niedrigerer Streak gibt es kein Checkmark.

## Versionierung
- Extension-Version auf `0.7.36` (Patch) angehoben.

## Verifikation
- Syntax-Checks erfolgreich:
  - `node --check extension/src/background.js`
  - `node --check extension/src/lib/storage.js`
  - `node --check extension/src/popup.js`