---
title: Slot-Mechanik entfernt dynamische Live-Tab-Verwaltung wiederhergestellt
type: progress
permalink: progress/slot-mechanik-entfernt-dynamische-live-tab-verwaltung-wiederhergestellt
tags:
- mvp
- cleanup
- watch-tabs
---

# Fortschritt

Die Slot-Mechanik wurde aus Background, Storage, TabManager und Popup entfernt.

## Umsetzung

- Reconcile arbeitet wieder mit `managedTabsByChannel`.
- `watch:start` setzt Zustand zurück und öffnet nur Tabs für live priorisierte Channels.
- `watch:stop` schließt alle verwalteten Tabs.
- Bei offline/Detach (z. B. Raid auf anderen Channel) werden verwaltete Tabs geschlossen.
- Tab-Erstellung bleibt in der TabGroup `TW Watch`.
- Slot-bezogenes Popup-Panel wurde entfernt; Channel-Liste zeigt wieder laufende Watch-/Claim-Infos.

## Version

- Extension-Version auf `0.7.5` erhöht (Patch).