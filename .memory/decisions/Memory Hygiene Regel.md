---
title: Memory Hygiene Regel
type: note
permalink: decisions/memory-hygiene-regel
tags:
- decision
- memory
- v1
---

# Memory Hygiene Regel

## Entscheidung
Fuer die v1 gilt eine manuelle Memory-Hygiene mit klarem Lifecycle (`active|historical|obsolete`).

## Regel
- Nur projektwertige Informationen bleiben im aktiven Memory: verbindliche Entscheidungen, geaenderte Annahmen, umgesetzte Meilensteine, bekannte offene v1-Risiken.
- Notizen nutzen den Lifecycle-Status `active|historical|obsolete` (Frontmatter `status` oder inferiert aus dem Inhalt).
- `historical` wird nach `.memory/archive/` verschoben.
- `obsolete` wird geloescht.

## Begruendung
Das reduziert Noise dauerhaft, ohne den aktiven Entscheidungs- und Fortschrittskontext zu verlieren. Die Loesung bleibt YAGNI-konform, weil sie ohne zusaetzliche Automatisierungsinfrastruktur auskommt.
