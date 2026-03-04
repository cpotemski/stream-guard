---
title: Playback Resume und Unmute Logik vereinfacht
type: progress
permalink: progress/playback-resume-und-unmute-logik-vereinfacht
tags:
- mvp
- playback
- cleanup
---

# Fortschritt

Die Playback-Überwachung im Content-Script wurde auf eine einfache Regel reduziert.

## Neue Logik

- Bei jedem Check: wenn der Player pausiert ist, wird `video.play()` versucht.
- Wenn der Player gemutet ist, wird ausschließlich der `m`-Shortcut ausgelöst.
- Komplexe Fallbacks (Button-Click, manuelles Volume-Setzen, Retry-Delays, User-Activation-Gates) wurden entfernt.

## Version

- Extension-Version auf `0.7.6` erhöht (Patch).