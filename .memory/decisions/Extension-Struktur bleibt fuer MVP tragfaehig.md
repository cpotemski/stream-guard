---
title: Extension-Struktur bleibt fuer MVP tragfaehig
type: decision
permalink: decisions/extension-struktur-bleibt-fuer-mvp-tragfaehig
tags:
- structure
- mvp
- refactor
---

# Extension-Struktur bleibt fuer MVP tragfaehig

## Entscheidung
Aktuell kein groesseres Refactor fuer die Extension-Struktur priorisieren.

## Begründung
- Die Codebasis ist fuer das MVP noch klein und klar abgegrenzt: `background.js` orchestriert, `content.js` interagiert mit Twitch DOM, `popup.js` rendert den Popup-Status, `lib/*` kapselt Storage, Tabs und Live-Status.
- Ein sofortiger Strukturumbau wuerde aktuell vor allem Bewegungsaufwand erzeugen, ohne direkten MVP-Mehrwert.
- Erste Druckpunkte sind sichtbar: `background.js` buendelt zu viele Verantwortungen, `content.js` mischt UI-Injektion, Uptime-Erkennung und Auto-Claim, `popup.js` zieht Live-Status selbst statt nur View zu sein.

## Konsequenz
- Kein breit angelegter Umbau jetzt.
- Nächster sinnvoller kleiner Refactor nur anlassbezogen: zuerst `content.js` in kleinere Helfer aufteilen, danach bei weiterem Wachstum den Reconcile-/Session-Teil aus `background.js` herausziehen.
