---
title: wake-recovery-and-network-error-reload-implemented
type: note
permalink: progress/wake-recovery-and-network-error-reload-implemented
---

## Umgesetzt
- Wake-/Sleep-Resync im Background implementiert:
  - Erkennung einer großen Alarm-Lücke (`orchestrator`-Tick-Gap)
  - Bei Wake: `reconcile` + gezieltes Reload nur bei wirklich problematischen Tabs (`discarded` oder Content-Script nicht erreichbar)
- Content-Script robust gemacht für Resume:
  - Resume-Signale (`visibilitychange`, `pageshow`, `focus`) triggern Sofort-Re-Sync
- Spezifischer Fehlerfall integriert:
  - Twitch Player Meldung `There was a network error ... (Error #2000)` wird erkannt
  - Reload nur bei erkanntem Fehler und mit Session-Cooldown gegen Reload-Loops
- Version erhöht auf `0.7.44` (Patch)

## MVP-Hinweis
Ansatz bleibt YAGNI-konform: keine neue komplexe Recovery-Architektur, nur notwendige Guardrails und gezielte Reloads.

- Error-2000-Erkennung sprachunabhängig gemacht (regex auf Fehlercode statt englischem Meldungstext).