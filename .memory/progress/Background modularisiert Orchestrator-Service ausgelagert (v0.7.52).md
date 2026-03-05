---
title: Background modularisiert Orchestrator-Service ausgelagert (v0.7.52)
type: note
permalink: progress/background-modularisiert-orchestrator-service-ausgelagert-v0-7-52
tags:
- progress
- v1
- architecture
- background
- orchestrator
---

## Umgesetzt
- Neuer Modulbaustein `extension/src/background/orchestratorService.js` eingefuehrt.
- Alarm-/Startup-/Install-Orchestrierung wurde aus `background.js` ausgelagert.
- `syncAlarm` und `updateBadge` werden jetzt ueber den Orchestrator-Service bereitgestellt.
- Wake-Gap-Erkennung (`orchestratorLastTickAt`) liegt jetzt ebenfalls im Orchestrator-Service.
- `background.js` bleibt damit als zentrales Wiring-Modul fuer Services und Runtime-Callbacks.

## Versionierung
- `extension/manifest.json` von `0.7.51` auf `0.7.52` erhoeht.