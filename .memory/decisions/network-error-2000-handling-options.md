---
title: network-error-2000-handling-options
type: note
permalink: decisions/network-error-2000-handling-options
---

## Kontext
Beim Twitch Watch Guard ist ein zusätzlicher Player-Fehlerfall aufgetreten: `There was a network error. Please try again. (Error #2000)`.

## Optionen (MVP)
1. Spezifisch: `Error #2000` im Content Script erkennen und den Tab mit Cooldown neu laden.
2. Generisch: Fallback-Reload, wenn länger als 20 Minuten keine Truhe geklickt wurde.
3. Hybrid (bevorzugt): Spezifische Erkennung + 20-Minuten-Fallback für unbekannte Hänger.

## YAGNI-Bewertung
Für MVP ist der Hybrid-Ansatz robust bei geringem Zusatzaufwand, ohne breites Fehlerframework einzuführen.

## Nächster Schritt
Testbare JS-Snippets in `content.js`/DevTools evaluieren (player-status-basiert), danach minimale produktive Integration.