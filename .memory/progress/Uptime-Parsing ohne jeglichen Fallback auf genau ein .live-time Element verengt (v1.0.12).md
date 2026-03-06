---
title: Uptime-Parsing ohne jeglichen Fallback auf genau ein .live-time Element verengt
  (v1.0.12)
type: progress
permalink: progress/uptime-parsing-ohne-jeglichen-fallback-auf-genau-ein-.live-time-element-verengt-v1.0.12
status: active
affected_version: 1.0.12
---

# Umsetzung
- Uptime-Parsing weiter verschaerft: exakt ein Parse-Pfad.
- Es wird nur `#live-channel-stream-information .live-time` gelesen.
- Kein Durchlauf ueber mehrere Kandidaten, keine interne Best-of-Logik, keine Fallbacks.
- Wenn das Element fehlt oder nicht parsebar ist, wird `null` zurueckgegeben.

# Geaenderte Dateien
- `extension/src/content.js`
- `extension/manifest.json` (Version auf 1.0.12)

# Ergebnis
Maximal deterministisches Uptime-Parsing gemaess Vorgabe: auf keinen Fall Fallback.