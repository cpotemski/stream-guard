---
title: Memory Lifecycle
type: note
permalink: planning/memory-lifecycle
tags:
- memory
- process
- v1
---

# Ziel
Memory bleibt klein, eindeutig und wartbar. Rauschen wird automatisch reduziert.

## Statusmodell
- `active`: aktuell relevant, bleibt im Hauptbaum.
- `historical`: fachlich ueberholt, aber als Kontext aufhebenswert.
- `obsolete`: nicht mehr relevant, kann entfernt werden.

## Manuelle Hygiene
- `active` bleibt im aktiven Baum (`.memory/decisions`, `.memory/planning`, `.memory/progress`).
- `historical` wird nach `.memory/archive/<section>/` verschoben.
- `obsolete` wird geloescht.

## Workflow-Regel
- Bei jedem Meilenstein oder wenn Notes offensichtlich noisy werden:
  - `historical` Notes in `.memory/archive/<section>/` verschieben.
  - `obsolete` Notes loeschen.
  - aktive Notes auf doppelte Inhalte pruefen und zusammenfuehren.

## Pflegehinweis
- Neue Notes sollen, wenn moeglich, ein Frontmatter-Feld `status` mit `active|historical|obsolete` enthalten.
- Ohne `status` greift die inferierte Bewertung aus dem Notizinhalt.
