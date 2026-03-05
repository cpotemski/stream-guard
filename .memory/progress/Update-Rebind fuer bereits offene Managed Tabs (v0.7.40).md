---
title: Update-Rebind fuer bereits offene Managed Tabs (v0.7.40)
type: note
permalink: progress/update-rebind-fuer-bereits-offene-managed-tabs-v0.7.40
tags:
- mvp
- progress
- background
- content-script
- update
- rebind
---

# Update-Rebind fuer bereits offene Managed Tabs (v0.7.40)

## Kontext
Nach Extension-Updates konnten bereits offene Twitch-Tabs ohne frisches Content Script laufen. Dadurch wurde eine sichtbare Truhe im Alt-Tab teils nicht erkannt, bis der Tab manuell neu geladen wurde.

## Umsetzung
- `onInstalled` verarbeitet jetzt `details.reason`.
- Bei `reason === "update"` werden bestehende `managedTabsByChannel` aus dem Runtime-State geprueft.
- Pro gemanagtem Tab wird ein Message-Ping (`watch:request-playback-state`) gesendet.
- Falls der Ping fehlschlaegt (kein receiving end), wird genau dieser Tab per `chrome.tabs.reload(tabId)` neu geladen.
- Debug-Events wurden fuer erfolgreiche/fehlgeschlagene Rebind-Reloads ergaenzt.

## Ergebnis fuer MVP
- Bestehende gemanagte Tabs werden nach Update automatisch wieder in einen gueltigen Content-Script-Zustand gebracht.
- Kein manueller Disable/Enable-Workaround notwendig.
- Scope bleibt klein und YAGNI-konform: nur Update-Fall, nur betroffene Tabs, keine neue Architektur.
