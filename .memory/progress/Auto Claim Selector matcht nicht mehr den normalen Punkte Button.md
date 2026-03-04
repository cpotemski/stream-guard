---
title: Auto Claim Selector matcht nicht mehr den normalen Punkte Button
type: note
permalink: progress/auto-claim-selector-matcht-nicht-mehr-den-normalen-punkte-button
tags:
- progress
- auto-claim
- bugfix
- dom
- mvp
---

# Umgesetzter Fortschritt

Der Auto-Claim-Selector greift nicht mehr auf den normalen Community-Points-Button.

## Problem
- Die bisherigen Fallback-Selektoren konnten den regulaeren Punkte-Button als claimbar interpretieren
- Das fuehrte zu False Positives: `🟡` sichtbar und `🎁` erhoeht, obwohl keine echte Bonus-Truhe da war

## Umsetzung
- Die zu breiten Fallback-Selektoren wurden entfernt
- Auto-Claim erkennt jetzt nur noch explizite `claimable-bonus`-Treffer im Community-Points-Bereich

## Zusatz
- Extension-Version wurde als Patch auf `0.5.3` erhoeht