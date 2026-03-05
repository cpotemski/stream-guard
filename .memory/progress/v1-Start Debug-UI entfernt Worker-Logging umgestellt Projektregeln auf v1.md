---
title: v1-Start Debug-UI entfernt Worker-Logging umgestellt Projektregeln auf v1
type: note
permalink: progress/v1-start-debug-ui-entfernt-worker-logging-umgestellt-projektregeln-auf-v1
tags:
- progress
- v1
- cleanup
- logging
- popup
---

## Umgesetzt
- Repository-Regeln in `AGENTS.md` von MVP-Fokus auf v1-Fokus umgestellt.
- Popup-Debugbereich fuer Endnutzer entfernt (`popup.html`, `popup.js`, `styles.css`).
- Popup zieht Status jetzt ueber `status:get` statt `debug:get`.
- Background-Debuglog-Persistenz entfernt; Events gehen jetzt in die Worker-Konsole (`console.info`).
- Tabseitige Fehler werden im Content-Script gezielt in der Tab-Konsole ausgegeben (`console.error`).

## Versionierung
- `extension/manifest.json` von `0.7.46` auf `0.7.47` (Patch) erhoeht.

## Einordnung
- Diese Aenderung ist der erste konkrete v1-Konsolidierungsschritt: weniger Altlasten in der UI, klarere Betriebsdiagnose (Worker-/Tab-Konsole) und reduzierte Debug-Verkabelung im Produktpfad.