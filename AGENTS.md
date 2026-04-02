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

## Engram workflow
- Use Engram via MCP for persistent project memory in this repository.
- For this repository, use the Engram project stream-guard.
- At session start, check the existing memories for project context.
- Before making assumptions, search Engram within the stream-guard project when possible.
- Store important decisions, debugging findings, setup details, constraints, and follow-up tasks.
- Link important new memories to the stream-guard project.
- At the end of substantial work, store a short project-relevant summary.
- Never store secrets or credentials in Engram.

## Dokumentationsstandard
- Dokumentiert werden nur Dinge mit echtem Projektwert:
  - verbindliche Entscheidungen
  - geaenderte Annahmen
  - umgesetzte Meilensteine
  - bekannte offene Risiken fuer die v1
- Keine aufgeblaehte Protokollierung von irrelevanten Zwischenschritten.

## Versionierung
- Bei jeder inhaltlichen Aenderung an der Extension ist die Versionsnummer zu erhoehen.
- Versionierung erfolgt nach SemVer, soweit fuer das Projekt sinnvoll:
  - Patch fuer kleine, rueckwaertskompatible Fixes oder interne Verbesserungen
  - Minor fuer neue, rueckwaertskompatible Features im v1-Rahmen
  - Major nur bei bewusst inkompatiblen Aenderungen

## Entscheidungsregel
- Im Konfliktfall hat YAGNI Vorrang vor "vielleicht spaeter nuetzlich".
- Im Konfliktfall hat eine klare v1-Lieferbarkeit Vorrang vor theoretischer Vollstaendigkeit.
