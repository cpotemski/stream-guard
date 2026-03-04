---
title: TabGroup-Workarounds zurückgenommen
type: note
permalink: progress/tab-group-workarounds-zuruckgenommen
tags:
- decision
- mvp
- tabgroup
---

# TabGroup-Workarounds zurückgenommen

## Entscheidung
- Die temporären Workarounds für die TabGroup-Beschriftung wurden entfernt.
- `ensureWatchGroup()` nutzt wieder den direkten Update-Call inklusive `title`, `color` und `collapsed` in einem Schritt.
- Die Extension-Version wurde auf `0.7.30` angehoben.

## Grund
- Die beobachtete `Unnamed group`-Anzeige wurde trotz mehrerer Timing-/Retry-Workarounds nicht reproduktionsbeeinflussend behoben.
- Es bleibt wahrscheinlich ein Chrome-Darstellungsproblem bei dieser Konstellation.

## Offener Punkt
- Keine weitere technische Anpassung im MVP-Umfang; Fokus auf mögliche Beobachtung/Workaround außerhalb der aktuellen Codepfade.