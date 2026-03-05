---
title: v1 Reconcile-Haertung Cooldown-Reopen und State-Cleanup (v0.7.48)
type: note
permalink: progress/v1-reconcile-haertung-cooldown-reopen-und-state-cleanup-v0-7-48
tags:
- progress
- v1
- reconcile
- recovery
- state
---

## Umgesetzt
- Reconcile nutzt jetzt `detachedUntilByChannel` statt `detachedChannels`.
- Bei Detach wird ein Reopen-Cooldown gesetzt (`DETACHED_REOPEN_COOLDOWN_MS`), danach ist automatisches Reopen wieder erlaubt.
- Die bisherige potentielle Dauer-Blockade bis zum Offline-Status wurde entfernt.
- Runtime-State vereinfacht:
  - `managedTabs` entfernt (duplizierter Zustand)
  - `openMode` entfernt (toter Setting-Pfad)
  - `detachedChannels` durch `detachedUntilByChannel` ersetzt
- Reset-/Stop-Pfade auf das neue Modell angepasst.

## Einordnung
- Das ist ein zentraler v1-Robustheits-Schritt fuer das 24/7-Ziel: weniger statische Sackgassen im Tab-Lifecycle und klarerer State ohne doppelte Felder.

## Versionierung
- `extension/manifest.json` von `0.7.47` auf `0.7.48` erhoeht.