---
title: Versionierungsregel
type: note
permalink: decisions/versionierungsregel
tags:
- decision
- process
- versioning
---

# Versionierungsregel

## Entscheidung
- Bei jeder inhaltlichen Aenderung an der Extension wird die Versionsnummer erhoeht.
- Als Standard wird SemVer verwendet, soweit fuer dieses Projekt sinnvoll.

## Praktische Auslegung
- Patch: kleine rueckwaertskompatible Fixes und kleinere interne Verbesserungen.
- Minor: neue rueckwaertskompatible Features innerhalb des MVP.
- Major: nur bei bewusst inkompatiblen Aenderungen.

## Konsequenz
- Zukuenftige Aenderungen an der Extension muessen immer auch eine passende Versionserhoehung enthalten.
