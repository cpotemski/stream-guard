---
title: Popup Enable-Disable mit Optimistic Feedback (v0.7.40)
type: progress
permalink: progress/popup-enable-disable-mit-optimistic-feedback-v0.7.40
tags:
- mvp
- popup
- ux
---

## Kontext
Enable/Disable im Popup (`watch-toggle`) wartete auf den Background-Response. Dadurch fuehlte sich der Toggle trage an.

## Entscheidung (YAGNI/MVP)
Keine neue Architektur. Gleiches Muster wie bei Move/Delete: optimistisches UI + Rollback.

## Umsetzung
- `extension/src/popup.js`
  - Neuer `updateAutoManage(enabled)`-Pfad fuer den Toggle.
  - Beim Umschalten wird `latestSnapshot.settings.autoManage` sofort optimistisch gesetzt und gerendert.
  - Waehrend Request ist der Toggle deaktiviert (`watchToggleUpdateInFlight`), um Doppelaktionen zu verhindern.
  - Bei Fehler: Rollback auf vorherigen Zustand.
  - Bei Erfolg: finaler Zustand aus Response, danach normaler Refresh-Zyklus.
- `extension/manifest.json`
  - Version auf `0.7.40` erhoeht.

## MVP-Risiko
- Bei Fehlern kurz sichtbarer Rollback, beabsichtigt fuer Datenkonsistenz.