---
title: Async-Flow beschleunigt mit Parallel-Live-Checks, State-Cache und Debug-Log-Buffer
  (v0.7.41)
type: note
permalink: progress/async-flow-beschleunigt-mit-parallel-live-checks-state-cache-und-debug-log-buffer-v0.7.41
---

# Umgesetzt (v0.7.41)

## 1) Live-Status schneller gemacht
- `lib/liveStatus.js` fragt Channel-Status jetzt parallel (`Promise.all`) statt strikt seriell.
- Kurzzeit-Cache (TTL 15s) fuer Live-Status eingefuehrt.
- In-Flight-Dedupe pro Channel eingefuehrt, damit parallele Requests auf denselben Channel nicht doppelt rausgehen.

## 2) Background-State/Authorize entlastet
- In `background.js` wurden kurze In-Memory-Reads mit TTL fuer Settings/Runtime-State eingefuehrt.
- Schreibpfade aktualisieren diese Caches direkt.
- Authorization-Resultate fuer `channel+tabId` werden kurzzeitig gecacht (TTL 3s), um wiederholte teure Pruefungen zu reduzieren.

## 3) Debug-Logging entkoppelt
- `appendDebugLog` schreibt nicht mehr sofort pro Event nach Storage.
- Events werden gepuffert und in Intervallen geflusht.
- `getDebugLog` flusht vor dem Lesen, damit UI-Debug weiterhin aktuell bleibt.

## Version
- `manifest.json` von `0.7.40` auf `0.7.41` (Patch) erhoeht.

## Erwarteter Effekt
- Spuerbar weniger akkumulierte Latenz durch weniger serielle Netz-/Storage-Roundtrips.
- Gleichbleibende MVP-Methodik, aber deutlich schnellere Reaktionskette in den heissen Pfaden.