---
title: Uptime-Parsing auf .live-time im live-channel-stream-information Container
  verengt (v1.0.11)
type: progress
permalink: progress/uptime-parsing-auf-.live-time-im-live-channel-stream-information-container-verengt-v1.0.11
status: active
affected_version: 1.0.11
---

# Kontext
Die Broadcast-Erkennung basiert auf einem berechneten Startzeitpunkt aus gelesener Uptime. Breite Fallbacks konnten potentiell falsche Zeitwerte liefern.

# Umsetzung
- Uptime-Erkennung in `content.js` strikt begrenzt auf `.live-time` innerhalb `#live-channel-stream-information`.
- Page-weite Fallback-Parser entfernt (`since live` / groesster Zeitwert auf gesamter Seite).
- Dadurch werden nur noch Zeiten aus dem vorgesehenen Live-Info-Bereich akzeptiert.

# Geaenderte Dateien
- `extension/src/content.js`
- `extension/manifest.json` (Version auf 1.0.11)

# Ergebnis
Weniger Risiko fuer false-positive Broadcast-Resets durch falsch geparste Zeitangaben ausserhalb des Live-Info-Bereichs.