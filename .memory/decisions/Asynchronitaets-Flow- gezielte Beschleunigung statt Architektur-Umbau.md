---
title: 'Asynchronitaets-Flow: gezielte Beschleunigung statt Architektur-Umbau'
type: note
permalink: decisions/asynchronitaets-flow-gezielte-beschleunigung-statt-architektur-umbau
---

# Kontext
Der Daten- und State-Flow wurde in `background.js`, `content.js`, `popup.js`, `lib/storage.js` und `lib/liveStatus.js` auf Delay-Bottlenecks geprueft.

# Entscheidung
Kein kompletter Architektur-Umbau fuer den MVP.
Stattdessen gezielte Optimierungen mit hohem Impact und niedrigem Risiko:

1. Live-Status-Abfragen parallelisieren und kurz cachen (TTL), statt seriell pro Channel.
2. Authorization-/State-Reads im Background entlasten (weniger wiederholte `getSettings`/`getRuntimeState` pro Message).
3. Debug-Log-Storage writes entkoppeln (batch/debounce), damit Events nicht auf I/O warten.

# Begruendung
- Der groesste wahrgenommene Delay kommt aktuell aus seriellen Netz- und Storage-Roundtrips, nicht aus fehlender Grundmethodik.
- Ein Full-Refactor (z. B. komplett event-sourcing/in-memory-only) waere fuer MVP unverhaeltnismaessig.
- Die drei Punkte reduzieren Latenz sichtbar, ohne die aktuelle Struktur oder Risiko stark zu erhoehen.

# Risiken / Guardrails
- Cache TTL kurz halten, damit Live-Status nicht stale wird.
- Bei Background-Neustarts muss weiterhin ein sauberer Fallback auf persisted State funktionieren.
- Keine neue Komplexitaet ohne direkten MVP-Nutzen (YAGNI).