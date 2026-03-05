---
title: Allowlist-Gate fuer Stream-Events im Background (v0.7.33)
type: note
permalink: progress/allowlist-gate-fuer-stream-events-im-background-v0.7.33
---

## Kontext
Nutzerproblem: Bei Streams ausserhalb der Streamer-Liste wurden weiterhin Aktionen/Verarbeitung im Background beobachtet.

## Verbindliche Entscheidung (MVP/YAGNI)
Es wird ein zentraler Allowlist-Gate im Background erzwungen: Stream-bezogene Events werden nur verarbeitet, wenn der Channel in `importantChannels` ist **und** das Event aus dem zugeordneten managed Tab kommt.

## Umsetzung
- `canManageChannelForTab(channel, tabId)` als zentrale Pruefung eingefuehrt.
- Gate auf folgende Events/Flows angewendet:
  - `watch:uptime`
  - `watch:playback-state`
  - `watch:playback-resumed`
  - `watch:playback-corrected`
  - `claim:record`
  - `claim:status`
  - `streak:report`
- Damit werden fuer nicht gelistete Channels keine Runtime-Updates/Claims/Playback-Aktionen mehr verarbeitet.

## Versionierung
- Extension-Version auf `0.7.33` (Patch) angehoben.

## Risiko/Restpunkt
- Kein automatischer E2E-Lauf im Repo; nur statischer Syntax-Check (`node --check extension/src/background.js`) durchgeführt.