---
title: v1 Konsolidierungsplan (Code, Doku, Memory)
type: plan
permalink: planning/v1-konsolidierungsplan-code-doku-memory
tags:
- plan
- v1
- cleanup
- architecture
---

# Ziel
Aus dem funktionalen Zwischenstand eine aufgeräumte, robuste und wartbare v1 bauen: keine User-Debugflächen, keine parallelen Varianten gleicher Features, klare Verantwortlichkeiten im Code.

## Phase 1: Konsolidierung der Produktregeln
- Eine verbindliche v1-Produkt-Spezifikation erstellen (Scope, Nicht-Ziele, harte Betriebsregeln).
- AGENTS/Projektregeln auf v1 ausrichten (MVP-Formulierungen als historisch markieren).
- Eindeutige Feature-Entscheidungen treffen (z. B. Stream-Limit, Unknown-Policy, manuelles Detach-Verhalten).

## Phase 2: Architektur-Neuschnitt (modular, aber schlank)
- Background in klare Module trennen: Orchestrator, Tab-Lifecycle, Session/Stats, Authorization, Message-API, Logging.
- Content-Script trennen: Channel-UI (Stern), Playback-Guard, Reward-Automation, Streak-Probe, DOM-Selektoren.
- Popup auf reine View+Commands reduzieren (keine doppelte Live-Status-Logik im Popup).
- Gemeinsame Domain-Modelle und Message-Contracts definieren.

## Phase 3: Feature-Konsolidierung
- Debug-UI aus Popup entfernen; Logs nur in Worker-Konsole (und tabbezogene Fehler in Tab-Konsole).
- Tote/alte Einstellungen entfernen (nur noch tatsächlich genutzte Settings/State-Felder behalten).
- Doppelte oder widersprüchliche Pfade zusammenführen (ein klarer Start/Stop- und Reconcile-Fluss).
- Tab-Detach/Redirect-Verhalten so definieren, dass 24/7-Ziel nicht unterlaufen wird.

## Phase 4: Robustheit für 24/7
- Recovery-Matrix für Fehlerklassen festlegen (Sleep/Wake, discarded tabs, Player Error #2000, fehlendes Content-Script, Redirects, Rate-Limits).
- Idempotente Reconcile- und Restart-Pfade sicherstellen.
- Selbstheilung priorisieren: fehlende/defekte Managed Tabs reproduzierbar zurück in OK-Zustand bringen.

## Phase 5: Verifikation und Release-Härtung
- Minimaler aber gezielter Testkatalog (manuelle E2E-Checkliste + kleine automatisierbare Kernchecks).
- v1-Readiness-Gates mit klaren Akzeptanzkriterien pro Hauptziel.
- Versionierung konsistent hochziehen und Release-Doku abschließen.

## Phase 6: Memory-/Doku-Hygiene
- Alte MVP-Planungsdokumente durch v1-Referenzdokumente ersetzen bzw. klar als historisch markieren.
- Mikro-Progress-Notizen in zusammengefasste Kapitel konsolidieren (Core Engine, Popup UX, Recovery, Rewards/Streak).
- Bekannte Risiken nur einmal zentral dokumentieren; überholte Einträge als ersetzt markieren.