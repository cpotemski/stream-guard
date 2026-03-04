---
title: Live-Erkennung Unknown Policy
type: note
permalink: decisions/live-erkennung-unknown-policy
tags:
- decision
- live-detection
- mvp
---

# Live-Erkennung bei unsicherem Status

## Entscheidung
Im MVP gilt fuer `unknown` ein striktes Verhalten:
- `unknown` wird niemals automatisch geoeffnet.
- Automatisches Oeffnen ist nur fuer hinreichend sichere Live-Signale erlaubt.

## Begruendung
- Ohne Twitch-API ist die Live-Erkennung absichtlich nur Best-Effort.
- Unsichere Auto-Opens wuerden zu Fehlverhalten und unnnoetigen Tabs fuehren.
- Das widerspricht YAGNI und verschlechtert die UX.

## Zusaetzlicher Kontext
- Da Watch-Tabs in einer eigenen TabGroup organisiert werden, ist ein geoeffneter Tab zwar weniger stoerend.
- Trotzdem bleibt das MVP konservativ: keine automatische Oeffnung auf unsicherer Grundlage.
