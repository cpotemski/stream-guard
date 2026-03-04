---
title: MVP Leitplanken
type: note
permalink: decisions/mvp-leitplanken
tags:
- twitch-watcher
- mvp
- yagni
---

# Twitch Watch Guard: MVP Leitplanken

## Kontext
Chrome-Extension (MV3) fuer Twitch Watch-Management ohne Server.

## Verbindliche Leitentscheidung
- Design-Prinzip: YAGNI strikt einhalten.
- Nur umsetzen, was die definierten MVP-Acceptance-Criteria direkt stuetzt.

## Daraus abgeleitete Entscheidungen
- Kein Twitch OAuth / keine Helix API im MVP.
- Keine Bonus-Truhe.
- Keine Multi-iframe-/Megatab-Loesung.
- Live-Erkennung nur als konservativer Best-Effort-Ansatz.
- Fokus auf: wichtige Channels, Popup-Management, maxStreams, TabGroup, Healthchecks, Recovery, Raid-Return.

## Arbeitsweise
- Wichtige Architekturentscheidungen und Fortschritte fortlaufend in Memory dokumentieren.
- Bei Unsicherheit die einfachste robuste Loesung waehlen.

## Migration
- Am 2026-03-04 aus dem `main`-Memory in das dedizierte Repo-Memory `twitch-watcher` uebernommen.
- Ablageort im Repository: `/Users/cpotemski/private/twitchWatcher/.memory/decisions/MVP Leitplanken.md`
