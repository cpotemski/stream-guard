---
title: TabGroup Titel wird beim Öffnen nicht als unnamed group angezeigt
type: note
permalink: progress/tab-group-titel-wird-beim-offnen-nicht-als-unnamed-group-angezeigt
tags:
- fix
- tabgroup
- mvp
---

# TabGroup Titel wird beim Öffnen nicht als unnamed group angezeigt

## Entscheidung
- In der TabGroup-Erzeugung wird der Gruppenname jetzt in einem separaten `chrome.tabGroups.update`-Aufruf gesetzt und erst danach erstreckt die Gruppe zu `collapsed: true`.
- Die Extension-Version wurde auf `0.7.26` angehoben.

## Begründung
- Direkte Kombination von Titel-Setzen und Collapse in einem Update schlug in der UI offenbar auf den ersten Render in `Unnamed group` durch.
- Geteilte Updates machen den Initialzustand robuster, ohne neue Architektur oder zusätzliche Features einzuführen.

## Risiko
- Keine neuen API-Aufrufe außer dem geteilten Update; Verhalten im collapsed-Zustand sollte gleich bleiben.