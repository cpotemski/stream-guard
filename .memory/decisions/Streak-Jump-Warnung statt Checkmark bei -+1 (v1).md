---
title: Streak-Jump-Warnung statt Checkmark bei >+1 (v1)
type: note
permalink: decisions/streak-jump-warnung-statt-checkmark-bei-1-v1
status: active
---

# Entscheidung
Wenn der gemeldete Streak-Wert gegenueber einer bekannten Baseline um mehr als 1 springt, wird fuer den aktuellen Stream kein Success-Checkmark gesetzt. Stattdessen wird ein Warnindikator gezeigt.

# Regel
- Exakt `baseline + 1` => `✅`
- Sprung `> baseline + 1` => `⚠️`
- Claim-Ereignisse bleiben davon entkoppelt.

# v1-Nutzen
Reduziert false positives bei der Streak-Bestaetigung und macht unplausible Werte sichtbar.