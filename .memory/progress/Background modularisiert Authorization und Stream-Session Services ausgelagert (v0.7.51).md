---
title: Background modularisiert Authorization und Stream-Session Services ausgelagert
  (v0.7.51)
type: note
permalink: progress/background-modularisiert-authorization-und-stream-session-services-ausgelagert-v0-7-51
tags:
- progress
- v1
- architecture
- background
- authorization
- session
---

## Umgesetzt
- Neuer Modulbaustein `extension/src/background/authorizationService.js` eingefuehrt.
  - Enthält Ownership-/Authorize-Logik (`canManageWatchTab`, `canManageChannelForTab`) inklusive internem Kurzzeit-Cache.
- Neuer Modulbaustein `extension/src/background/streamSessionService.js` eingefuehrt.
  - Enthält Runtime-Updates fuer Uptime/Broadcast-Session, Claim-Tracking, Claim-Availability und Streak-Status.
- `background.js` delegiert diese Verantwortungen jetzt an die Services und wurde weiter entschlackt.
- Auth-Cache-Invalidierung laeuft jetzt zentral ueber den Authorization-Service bei Settings-/RuntimeState-Write.

## Wirkung
- Klarere Trennung von Orchestrierung, Tab-Lifecycle, Message-Routing, Authorisierung und Session/Stats-Logik.
- Bessere Wartbarkeit und niedrigere Komplexitaet pro Datei bei unveraendertem Verhalten.

## Versionierung
- `extension/manifest.json` von `0.7.50` auf `0.7.51` erhoeht.