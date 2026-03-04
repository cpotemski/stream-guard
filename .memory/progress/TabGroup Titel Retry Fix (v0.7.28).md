---
title: TabGroup Titel Retry Fix (v0.7.28)
type: note
permalink: progress/tab-group-titel-retry-fix-v0.7.28
tags:
- fix
- tabgroup
- mvp
---

# TabGroup Titel Retry Fix v0.7.28

## Entscheidung
- Der Group-Setup-Flow in `ensureWatchGroup()` wurde mit einem kleinen Retry-Pattern erweitert: Titel wird nach der Gruppenerstellung mehrfach nachgezogen, anschließend erst kollabiert und danach noch einmal hart gesetzt.
- Die Extension-Version wurde auf `0.7.28` erhöht.

## Warum
- Erste Aktualisierung des Gruppentitels kann in Chrome bei neu geschaffenen, gleich kollabierten Gruppen offenbar nicht sofort in der UI landen.
- Der Retry-Ansatz ist bewusst minimal: gleiche API, keine neue Architektur.

## Offene Rest-Risiken
- Falls Chrome intern weiterhin den Namen nicht rendert, bleibt das Problem möglicherweise UI-seitig außerhalb der API-Steuerung.