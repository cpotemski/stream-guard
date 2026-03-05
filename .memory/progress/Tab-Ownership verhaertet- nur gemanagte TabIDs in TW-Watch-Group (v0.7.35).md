---
title: 'Tab-Ownership verhaertet: nur gemanagte TabIDs in TW-Watch-Group (v0.7.35)'
type: note
permalink: progress/tab-ownership-verhaertet-nur-gemanagte-tab-ids-in-tw-watch-group-v0.7.35
---

## Kontext
Weiterer Haertungspunkt fuer MVP-Sicherheit: Aktionen sollen ausschliesslich auf Tabs laufen, die die Extension selbst verwaltet.

## Verbindliche Entscheidung (MVP/YAGNI)
Autorisierung basiert nicht nur auf Channel-Allowlist, sondern zusaetzlich auf konkreter Tab-Ownership:
- Tab-ID muss exakt dem Eintrag in `managedTabsByChannel[channel]` entsprechen.
- Tab muss weiterhin auf den erwarteten Channel zeigen.
- Tab muss in der von der Extension verwendeten Gruppe `TW Watch` sein.

## Umsetzung
- `canManageChannelForTab(channel, tabId)` in `background.js` verhaertet um:
  - `tabs.get(tabId)` Existenzcheck
  - URL->Channel Match (`getChannelFromTab`)
  - `tab.groupId` Check + `tabGroups.get(groupId).title === "TW Watch"`
- Alle bereits vorhandenen Event-Gates profitieren automatisch, da sie diese zentrale Pruefung nutzen.

## Wirkung
- Keine Verarbeitung mehr fuer Tabs ausserhalb der Extension-Tabgroup oder bei entkoppelten/manuell verschobenen Tabs.

## Versionierung
- Extension-Version auf `0.7.35` (Patch) angehoben.

## Verifikation
- Syntax-Check erfolgreich: `node --check extension/src/background.js`.