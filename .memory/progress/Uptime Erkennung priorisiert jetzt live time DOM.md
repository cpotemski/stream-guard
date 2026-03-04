---
title: Uptime Erkennung priorisiert jetzt live time DOM
type: note
permalink: progress/uptime-erkennung-priorisiert-jetzt-live-time-dom
tags:
- progress
- watchtime
- dom
- bugfix
- mvp
---

# Umgesetzter Fortschritt

Die Uptime-Erkennung priorisiert jetzt die konkret beobachtete Twitch-DOM-Struktur der `live-time`.

## Umsetzung
- Zuerst werden `.live-time p` und `.live-time [aria-hidden='true']` geprueft
- Erst danach folgen allgemeinere Fallback-Kandidaten

## Warum
- Das konkrete DOM liefert in deinem Beispiel die echte Stream-Uptime direkt und ist damit robuster als allgemeine Kandidaten

## Zusatz
- Extension-Version wurde als Patch auf `0.4.3` erhoeht