---
title: Auto Claim erkennt jetzt den Bonus Button in der aktuellen Footer Struktur
type: note
permalink: progress/auto-claim-erkennt-jetzt-den-bonus-button-in-der-aktuellen-footer-struktur
tags:
- progress
- auto-claim
- bugfix
- dom
- mvp
---

# Umgesetzter Fortschritt

Der Auto-Claim-Pfad erkennt den Bonus-Button jetzt passend zur aktuell beobachteten Twitch-DOM-Struktur im Chat-Footer.

## Problem
- Der bisherige Selector erwartete ein `claimable-bonus`-Element, das einen `button` enthaelt
- In der aktuellen Struktur ist es umgekehrt: der `button` enthaelt die `claimable-bonus__icon`

## Umsetzung
- Statt eines starren Selectors wird jetzt zuerst `community-points-summary` gesucht
- Darin werden Buttons durchsucht
- Als Claim-Button gilt jetzt der erste Button, dessen eigener Unterbaum ein Element mit `claimable-bonus` enthaelt

## Zusatz
- Der Pruefintervall bleibt bei `5` Sekunden
- Extension-Version wurde als Patch auf `0.7.2` erhoeht