---
title: TabGroup Titel - Collapse Delay Test
type: note
permalink: progress/tab-group-titel-collapse-delay-test
tags:
- fix
- tabgroup
- mvp
---

# TabGroup Titel - Collapse Delay Test

## Entscheidung
- `ensureWatchGroup` setzt nun zuerst `title` und `color`, wartet kurz und setzt danach `collapsed: true`.
- Ziel ist ein A/B-Check, ob der Initial-`Unnamed group`-Effekt mit sofortigem Collapse zusammenhängt.
- Extension-Version wurde auf `0.7.29` angehoben.

## Ergebnisziel
- Wenn das Problem danach verschwindet, war das Timing zum Collapsing die Ursache.
- Wenn nicht, liegt der Effekt wahrscheinlich außerhalb der bisherigen API-Sequenz (Chrome-UI-Render-Race).