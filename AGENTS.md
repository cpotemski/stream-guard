# AGENTS.md

## Zweck
Diese Datei definiert verbindliche Arbeitsregeln fuer dieses Repository.

## Verbindliche Regeln
- Design-Prinzip: YAGNI strikt einhalten.
- Nur Features, Abstraktionen und Architektur einfuehren, die die aktuellen MVP-Acceptance-Criteria direkt unterstuetzen.
- Keine vorgezogenen Nice-to-haves, keine vorsorglichen Erweiterungen, kein Overengineering.
- Bei Unsicherheit immer die einfachste robuste Loesung waehlen.

## Projektfokus (MVP)
- Fokus bleibt auf dem Twitch Watch Guard MVP.
- Ausserhalb des MVPs liegende Themen werden nicht vorgezogen.
- Wenn eine Idee nicht unmittelbar fuer den aktuellen MVP notwendig ist, wird sie nicht umgesetzt, sondern hoechstens als spaeterer Kandidat notiert.

## Memory-Nutzung
- Fuer dieses Projekt ist das dedizierte Memory-Projekt `twitch-watcher` zu verwenden.
- Wichtige Entscheidungen muessen in diesem Memory-Projekt dokumentiert werden.
- Reale Fortschritte muessen in diesem Memory-Projekt dokumentiert werden.
- Vor groesseren Richtungsentscheidungen ist der relevante Memory-Kontext zu pruefen.
- Memory-Hygiene erfolgt nur anlassbezogen bei Meilensteinen oder realer Unuebersicht; doppelte oder ueberholte Eintraege werden bei Bedarf zusammengefuehrt oder klar als ersetzt markiert.

## Dokumentationsstandard
- Dokumentiert werden nur Dinge mit echtem Projektwert:
  - verbindliche Entscheidungen
  - geaenderte Annahmen
  - umgesetzte Meilensteine
  - bekannte offene Risiken fuer das MVP
- Keine aufgeblaehte Protokollierung von irrelevanten Zwischenschritten.

## Versionierung
- Bei jeder inhaltlichen Aenderung an der Extension ist die Versionsnummer zu erhoehen.
- Versionierung erfolgt nach SemVer, soweit fuer das Projekt sinnvoll:
  - Patch fuer kleine, rueckwaertskompatible Fixes oder interne Verbesserungen
  - Minor fuer neue, rueckwaertskompatible Features im MVP-Rahmen
  - Major nur bei bewusst inkompatiblen Aenderungen

## Entscheidungsregel
- Im Konfliktfall hat YAGNI Vorrang vor "vielleicht spaeter nuetzlich".
- Im Konfliktfall hat eine klare MVP-Lieferbarkeit Vorrang vor theoretischer Vollstaendigkeit.
