---
title: 'Popup-Status bleibt auf Pause: Playback-Events aktivieren und Playback-Logs'
type: note
permalink: progress/popup-status-bleibt-auf-pause-playback-events-aktivieren-und-playback-logs
tags:
- status
- popup
- debug
---

## Entscheidung
- Ursache für "hängt auf pause" wird als mögliche verzögerte/ausbleibende Zustandsmeldungen angenommen (Polling allein reicht im Live-Betrieb nicht immer).
- Content-Script bekommt jetzt Event-Listener auf Twitch-Video-Element (play/pause/volumechange/playing/waiting/loadedmetadata) und debounced sofortige Reporting-Reaktion.
- Zusätzliche Logs für `watch:playback-state` wurden im Background ergänzt, um zu sehen, ob Meldungen ankommen und ob die Tab-ID/Channel-Matchung passt.

## Umgesetzt
- `extension/src/content.js`
  - Debounced Playback-State-Events eingefügt (`PLAYBACK_REPORT_DEBOUNCE_MS`, `PLAYBACK_STATE_EVENTS`).
  - Event-Listener werden bei Channel-Wechsel und jedem `syncButton`-Durchlauf angebunden.
  - URL-Channel-Normalisierung für `getChannelFromLocation` um End-Slash bereinigt.
- `extension/src/background.js`
  - `watch:playback-state` loggt jetzt `playback-state:ignored` und `playback-state:updated` (oder `invalid`) im Debug-Log.

## Annahmen / Hinweis
- Damit kann im nächsten Debug-Snapshot eindeutig abgeglichen werden: kommt weiterhin `paused` als Status obwohl der Player läuft, oder kommt kein `playback-state`-Update vom Content-Skript.
- Diese Änderung ist vollständig im bestehenden MVP-Flow und benötigt keine neue Architektur.