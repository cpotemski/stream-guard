---
title: Streak-Dual-Parser Primary-first ohne 366-Grenze (v1)
type: note
permalink: decisions/streak-dual-parser-primary-first-ohne-366-grenze-v1
status: active
date: 2026-03-06
version: 1.0.13
---

# Entscheidung
Die Watch-Streak-Erkennung nutzt zwei Parserpfade mit fester Prioritaet:
- Primary: neue Watch-Streak-Darstellung im Reward-Center (`#watch-streak-footer` / `aria-controls='watch-streak-footer'`)
- Fallback: bisherige Legacy-Card-Erkennung

## Verbindliche Regel
- Wenn Primary einen gueltigen Wert liefert, gewinnt Primary immer.
- Fallback wird nur als Rueckfall genutzt, wenn Primary keinen gueltigen Wert liefert.
- Wenn beide Parser gueltige, aber unterschiedliche Werte liefern, wird trotzdem Primary verwendet und ein Konflikt diagnostisch geloggt.

## Sprachunabhaengigkeit
- Es werden keine sprachbasierten Labels fuer die Erkennung verwendet.
- Parsing basiert auf strukturellen Merkmalen (Container, Icon-Path, Progressbar/Chevron-Form).

## Haertung
- Die harte Obergrenze `<= 366` wurde entfernt.
- Stattdessen werden nur strukturell verankerte Integer-Kandidaten akzeptiert.
- Bereiche mit Reward-/Cost- und Points/Bits-Zahlen werden als Streak-Quellen ausgeschlossen.

## v1-Nutzen
Mehr Robustheit gegen Twitch-UI-Varianten bei gleichzeitig konservativer Fehlzahl-Vermeidung.
