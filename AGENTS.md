# AGENTS.md

## Zweck
Diese Datei definiert verbindliche Arbeitsregeln fuer dieses Repository.

## Verbindliche Regeln
- Design-Prinzip: YAGNI strikt einhalten.
- Nur Features, Abstraktionen und Architektur einfuehren, die die aktuellen v1-Produktziele direkt unterstuetzen.
- Keine vorgezogenen Nice-to-haves, keine vorsorglichen Erweiterungen, kein Overengineering.
- Bei Unsicherheit immer die einfachste robuste Loesung waehlen.

## Projektfokus (v1)
- Fokus liegt auf einer fertig nutzbaren Twitch Watch Guard v1.
- Priorisiert werden Robustheit (24/7), einfache Nutzbarkeit, minimale Nutzerinteraktion und klare Betriebsuebersicht.
- Themen ausserhalb dieser v1-Ziele werden nicht vorgezogen und hoechstens als spaeterer Kandidat notiert.

## Memory-Nutzung
- Fuer dieses Projekt ist das dedizierte Memory-Projekt `twitch-watcher` zu verwenden.
- Wichtige Entscheidungen muessen in diesem Memory-Projekt dokumentiert werden.
- Reale Fortschritte muessen in diesem Memory-Projekt dokumentiert werden.
- Vor groesseren Richtungsentscheidungen ist der relevante Memory-Kontext zu pruefen.
- Memory-Hygiene erfolgt manuell anhand klarer Lifecycle-Regeln (`active|historical|obsolete`).
- Lifecycle-Regeln fuer `active|historical|obsolete` sind in `.memory/README.md` definiert und verbindlich.
- Historische oder obsolete Eintraege werden nicht im aktiven Memory-Baum belassen.

## Dokumentationsstandard
- Dokumentiert werden nur Dinge mit echtem Projektwert:
  - verbindliche Entscheidungen
  - geaenderte Annahmen
  - umgesetzte Meilensteine
  - bekannte offene Risiken fuer die v1
- Keine aufgeblaehte Protokollierung von irrelevanten Zwischenschritten.
- Neue Notes sollen ein `status`-Feld im Frontmatter nutzen (`active|historical|obsolete`).

## Versionierung
- Bei jeder inhaltlichen Aenderung an der Extension ist die Versionsnummer zu erhoehen.
- Versionierung erfolgt nach SemVer, soweit fuer das Projekt sinnvoll:
  - Patch fuer kleine, rueckwaertskompatible Fixes oder interne Verbesserungen
  - Minor fuer neue, rueckwaertskompatible Features im v1-Rahmen
  - Major nur bei bewusst inkompatiblen Aenderungen

## Entscheidungsregel
- Im Konfliktfall hat YAGNI Vorrang vor "vielleicht spaeter nuetzlich".
- Im Konfliktfall hat eine klare v1-Lieferbarkeit Vorrang vor theoretischer Vollstaendigkeit.
