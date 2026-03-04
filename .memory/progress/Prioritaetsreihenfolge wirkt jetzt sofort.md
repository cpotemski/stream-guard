---
title: Prioritaetsreihenfolge wirkt jetzt sofort
type: note
permalink: progress/prioritaetsreihenfolge-wirkt-jetzt-sofort
tags:
- progress
- priority
- orchestrator
---

# Prioritaetsreihenfolge wirkt jetzt sofort

## Problem
Die Sortierung im Popup aenderte zwar die gespeicherte Reihenfolge, hatte aber auf laufende Watch-Tabs zunaechst keinen direkten Effekt.

## Umsetzung
- Solange `autoManage` aktiv ist, fuehren jetzt relevante Aenderungen sofort zu einer Neuanwendung der verwalteten Tabs:
  - Prioritaetsaenderungen
  - Aenderungen an der wichtigen Channel-Liste
  - `maxStreams`-Aenderungen
  - Umschalten auf `autoManage=true`
- Zusaetzlich wird dieselbe Reconcile-Logik beim Alarm-Tick erneut angewendet.

## MVP-Verhalten
- Die aktuelle Minimalstrategie ist bewusst einfach: bestehende verwaltete Tabs werden geschlossen und gemaess der aktuellen Top-N-Prioritaet neu geoeffnet.
- Das ist bewusst noch keine feingranulare In-Place-Umsortierung, aber funktional korrekt fuer das MVP.
