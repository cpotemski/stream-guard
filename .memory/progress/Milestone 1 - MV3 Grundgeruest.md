---
title: Milestone 1 - MV3 Grundgeruest
type: note
permalink: progress/milestone-1-mv3-grundgeruest
tags:
- progress
- milestone
- mvp
---

# Milestone 1: MV3 Grundgeruest umgesetzt

## Umgesetzt
- Basisstruktur unter `extension/` angelegt.
- `manifest.json` fuer Chrome MV3 erstellt.
- Background Service Worker mit einfacher Message-Steuerung fuer:
  - Settings lesen/aktualisieren
  - Channel markieren/entmarken
  - Start/Stop der Watch-Gruppe
  - Badge-Update
  - Alarm-Grundlage fuer spaetere Orchestrierung
- Content Script fuer Twitch-Seiten erstellt:
  - injiziert einen dezenten Stern-Button
  - toggelt wichtige Channels
  - zeigt einfachen Toast
  - beobachtet Twitch-SPA-URL-Wechsel in einfacher Form
- Popup erstellt:
  - Anzeige wichtiger Channels
  - Prioritaetsreihenfolge per Hoch/Runter
  - `autoManage` Toggle
  - `maxStreams` Auswahl (1-3)
  - `Open Watch Group` / `Stop & Close`
- Einfache Tab-Verwaltung erstellt:
  - oeffnet Top-N Channels aus der Prioritaetsliste in Tabs
  - packt diese in die TabGroup `Twitch Watch`
  - schliesst beim Stop nur selbst verwaltete Tabs, niemals beliebige Twitch-Tabs

## Bewusst noch nicht umgesetzt
- keine echte Live-Erkennung
- keine Healthchecks
- keine Recovery-Policy
- keine Raid/Redirect-Erkennung
- keine Statusanzeige pro Channel

## Warum das so ist
- Entspricht YAGNI: erst das tragfaehige Grundgeruest und sichere Datenfluesse, dann die eigentliche Watch-Logik.
