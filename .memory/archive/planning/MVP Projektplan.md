---
title: MVP Projektplan
type: note
permalink: planning/mvp-projektplan
tags:
- plan
- mvp
- scope
---

## Status (2026-03-05)
Diese Notiz ist **historisch**.
Sie wurde durch `planning/v1-produkt-spezifikation` und `planning/v1-konsolidierungsplan-code-doku-memory` als aktive Planungsbasis ersetzt.

# Twitch Watch Guard: MVP Projektplan

## Ziel
Chrome-Extension (MV3), die wichtige Twitch-Streams offen und laufend haelt, ohne Tab-Chaos zu erzeugen.
Robust gegen Raid/Redirect, Player-Errors, Disconnects, eingefrorene Tabs und Offlines, soweit ohne Server sinnvoll moeglich.

## Kern-UX
- Auf `https://twitch.tv/<channel>` wird ein dezenter Stern-Button injiziert.
- Der Stern toggelt, ob ein Channel als wichtig markiert ist.
- Das Popup verwaltet wichtige Channels, Prioritaeten, `maxStreams`, Start/Stop und zeigt Status.

## Tab-Grundprinzip
- Die Extension verwaltet hoechstens `maxStreams` echte Twitch-Tabs.
- Diese Tabs werden in einer dedizierten TabGroup `Twitch Watch` organisiert.
- Keine Tab-Leichen: offline Tabs werden im MVP geschlossen.
- Bei mehr Live-Channels als Slots entscheidet die Prioritaet.

## Orchestrierung
- MV3 Service Worker verwaltet Settings, Runtime-State, Scheduler, Tab-Steuerung und Health-Events.
- `chrome.alarms` treibt periodische Orchestrator-Ticks.
- `chrome.storage.sync` speichert Einstellungen, `chrome.storage.local` Runtime-Zustand.

## Live-Status (MVP)
- Kein OAuth, keine Helix API.
- Live-Erkennung ist nur Best-Effort.
- Primaer degradiert: Zustand aus bereits offenen Watch-Tabs ableiten.
- Optional konservatives `fetch` auf Channel-Seiten mit einfacher Marker-Pruefung.
- Wenn unsicher, dann kein aggressives Auto-Open, sondern Status `unknown`.

## Healthcheck
- Content Script auf Twitch-Seiten erkennt:
  - Channel-Mismatch (Raid/Redirect)
  - Fehler-Overlays / Player-Fehler
  - pausierten oder festhaengenden Videofortschritt
- Meldet Status an den Background: `ok`, `stalled`, `error`, `raided`.

## Recovery
- `stalled` -> Tab reload.
- `error` -> reload; nach Wiederholungen close + reopen.
- `raided` -> Ruecknavigation auf den Ziel-Channel.

## Channel-State-Maschine
- OFFLINE
- LIVE_UNKNOWN
- WATCHING_OK
- WATCHING_STALLED
- RECOVERING
- RAIDED_REDIRECT
- ERROR

## MVP Scope
- Stern-Button zum Markieren.
- Popup mit Liste, Prioritaet, `maxStreams`, Start/Stop.
- TabGroup `Twitch Watch`.
- Oeffnen und Schliessen von Watch-Tabs nach Prioritaet.
- Healthchecks, Recovery und Raid-Return.
- Kein Bonus-Claiming.
- Keine offizielle Twitch-API-Abhaengigkeit.

## Akzeptanzkriterien
1. Ein Channel kann auf Twitch per Stern markiert werden und erscheint im Popup.
2. Prioritaeten und `maxStreams` sind einstellbar.
3. `Auto-Manage` oeffnet maximal `maxStreams` Tabs in einer TabGroup.
4. Fehler- und Stall-Zustaende loesen automatische Recovery aus.
5. Raid/Redirect fuehrt zur Ruecknavigation auf den Ziel-Channel.
6. `Stop` schliesst Watch-Tabs sauber.

## Umsetzungsleitplanke
- Der Plan ist fuer das MVP ausreichend.
- Umsetzung bleibt strikt unter YAGNI.
- Alles ausserhalb des MVP wird nicht vorgezogen.