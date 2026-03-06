---
title: 'Streak-Semantik: Unknown != 0 und Increase nur bei exakt +1 (v1)'
type: note
permalink: decisions/streak-semantik-unknown-0-und-increase-nur-bei-exakt-1-v1
status: active
---

# Entscheidung
Die Streak-Logik unterscheidet strikt zwischen `unknown` und `0`.

# Verbindliche Regeln
- Nicht erkannte Baseline darf nicht als `0` interpretiert werden.
- Ein `streak increase` gilt nur bei exakt `baseline + 1`.
- Spruenge (z. B. `+2` oder mehr) markieren kein Increase fuer den aktuellen Stream.
- Claim-Events bleiben fachlich getrennt von der Streak-Erhoehung; Claims zeigen nur Viewer-Aktivitaet/Verfuegbarkeit.

# v1-Ziel
Verhindert false positives beim ✅ und haertet die Watch-Streak-Aussage ohne Zusatzkomplexitaet.