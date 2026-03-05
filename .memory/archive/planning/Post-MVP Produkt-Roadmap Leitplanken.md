---
title: Post-MVP Produkt-Roadmap Leitplanken
type: note
permalink: planning/post-mvp-produkt-roadmap-leitplanken
tags:
- plan
- product
- post-mvp
---

## Status (2026-03-05)
Diese Notiz ist **historisch**.
Die aktive Zieldefinition liegt jetzt in `planning/v1-produkt-spezifikation`.

# Post-MVP Produkt-Roadmap Leitplanken

## Kontext
Der MVP wird als erreicht betrachtet. Naechster Schritt ist eine bewusst opinionated, privat genutzte Extension mit hohem direktem Nutzwert statt allgemeiner Plattform-Produktisierung.

## Festgelegte Leitplanken
- Das Popup soll kompakt sein und bevorzugt mit Icons statt viel Text arbeiten.
- Wichtige Runtime-Infos werden im Popup pro Streamer kompakt dargestellt.
- Persistiert werden nur Extension-Settings (z. B. beobachtete Streamer, Prioritaeten, Einstellungen).
- Laufzeit-Statistiken und Session-Counter werden nicht langfristig persistiert.
- Counter sind pro Streamer und pro Session relevant, nicht global historisch.
- Nutzerkontrolle fuer opinionated Automationen (z. B. Auto-Claim) ist vorerst nicht erforderlich.
- Migration fuer neue Runtime-Daten ist vorerst nicht erforderlich.
- Tests werden fuer diesen Planungsschritt bewusst zurueckgestellt.

## Geplante Feature-Bloecke
1. Live-Indikator im Popup.
2. Watchtime pro Streamer fuer die aktuelle Broadcast-Session.
3. Automatisches Claimen der Bonus-Truhe mit sessionbasiertem Counter pro Streamer.
4. Spaetere Streak-Erkennung; detaillierte DOM-/Signal-Analyse folgt separat.

## Technische Leitgedanken
- Watchtime resetet bei neuer Broadcast-Session desselben Streamers, nicht nur bei Channel-Wechsel.
- Eine neue Broadcast-Session wird initial pragmatisch ueber die auf der Twitch-Seite sichtbare Uptime des Streams angenaehert: aus der aktuellen Zeit minus angezeigter Stream-Uptime wird ein Startzeitpunkt der laufenden Broadcast-Session abgeleitet.
- Fuer Auto-Claim keine Lokalisierungs-abhaengigen Selektoren wie `aria-label`.
- Bevorzugt robuste DOM-Selektoren und ein MutationObserver-basierter Ansatz.
- Auto-Claim laeuft nur auf den von der Extension verwalteten Watch-Tabs.
- DOM-Aenderungen bei Twitch werden bewusst als nachjustierbare Wartung akzeptiert.
## Offene Punkte
- Welcher konkrete kompakte Icon-Satz im Popup final genutzt wird; fuer den Start sind einfache Emojis ausreichend.
- Bei unbekanntem oder fehlendem Zustand wird im Popup ein klarer `❔`-Status verwendet.
- Welche konkreten DOM-Signale fuer Streak-Erkennung spaeter verwendet werden.
- Streak-Erkennung ist bewusst nicht v1-relevant und blockiert die ersten Produkt-Iterationen nicht.