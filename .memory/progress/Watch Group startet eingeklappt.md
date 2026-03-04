---
title: Watch Group startet eingeklappt
type: note
permalink: progress/watch-group-startet-eingeklappt
tags:
- progress
- ux
- mvp
---

# Umgesetzter Fortschritt

Die automatisch erzeugte Watch-Tab-Gruppe startet jetzt standardmaessig eingeklappt.

## Umsetzung
- `chrome.tabGroups.update(..., { collapsed: true })` fuer die verwaltete Gruppe

## Wirkung
- neue Watch-Gruppen sind direkt kompakter
- das passt besser zum Ziel, Twitch-Watch-Tabs ohne Tab-Chaos zu organisieren

## Zusatz
- Extension-Version wurde als Patch auf `0.1.7` erhoeht