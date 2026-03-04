---
title: Watch Start setzt Runtime-State hart zurueck
type: note
permalink: progress/watch-start-setzt-runtime-state-hart-zurueck
tags:
- progress
- bugfix
- storage
- mvp
---

# Umgesetzter Fortschritt

`Open Watch Group` fuehrt jetzt vor dem Neuaufbau immer einen harten Reset des lokalen Runtime-States aus.

## Warum
- Lokale Alt-Daten in `chrome.storage.local` konnten neue Oeffnungsvorgaenge beeinflussen
- Insbesondere alte `managedTabs`, `managedTabsByChannel` oder `detachedChannels` konnten zu unerwartetem Verhalten fuehren

## Umsetzung
- Vor `watch:start` werden alle bisher getrackten Tabs aus altem Runtime-State geschlossen
- Danach wird der Runtime-State komplett geleert
- Erst anschliessend erfolgt der frische Reconcile-Lauf

## Wirkung
- `Open Watch Group` ist wieder ein sauberer Neustart statt ein inkrementelles Weiterarbeiten auf moeglicherweise veraltetem Local-State
- Das reduziert Probleme durch Storage-Altlasten deutlich

## Zusatz
- Extension-Version wurde als Patch auf `0.1.5` erhoeht