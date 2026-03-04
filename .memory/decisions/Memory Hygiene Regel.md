---
title: Memory Hygiene Regel
type: note
permalink: decisions/memory-hygiene-regel
tags:
- decision
- memory
- mvp
---

# Memory Hygiene Regel

## Entscheidung
Fuer das Twitch Watch Guard MVP wird keine separate automatische Memory-Cleanup- oder Compression-Mechanik eingefuehrt.
Stattdessen gilt eine leichte manuelle Memory-Hygiene-Regel an echten Meilensteinen oder bei erkennbarer Unuebersicht.

## Regel
- Nur projektwertige Informationen bleiben im Memory: verbindliche Entscheidungen, geaenderte Annahmen, umgesetzte Meilensteine, bekannte offene MVP-Risiken.
- Doppelte oder ueberholte Notizen werden bei Bedarf zusammengefuehrt oder klar als ersetzt markiert.
- Reine Zwischenstaende und irrelevantes Arbeitsrauschen werden nicht nachdokumentiert.
- Memory-Hygiene erfolgt nur anlassbezogen, nicht als eigener regelmaessiger Automations-Mechanismus.

## Begruendung
Das erfuellt den Dokumentationszweck mit minimalem Aufwand und bleibt im Einklang mit YAGNI und dem MVP-Fokus. Ein separater Cleanup-Mechanismus wird erst eingefuehrt, wenn Memory-Unordnung zu einem realen Problem wird.