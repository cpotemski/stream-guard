---
title: Auto Claim zaehlt jetzt sessionbasiert pro Channel
type: note
permalink: progress/auto-claim-zaehlt-jetzt-sessionbasiert-pro-channel
tags:
- progress
- mvp
- auto-claim
- popup
---

# Umgesetzter Fortschritt

Der erste Auto-Claim-Baustein ist jetzt vorhanden: verwaltete Watch-Tabs koennen erkannte Bonus-Claims automatisch ausloesen und pro Channel sessionbasiert mitzaehlen.

## Umsetzung
- Runtime-State fuehrt jetzt `claimStatsByChannel`
- Der Background autorisiert Claims nur fuer aktuell verwaltete Watch-Tabs bei aktivem Watch-Lauf
- Das Content-Script prueft periodisch auf Claim-Kandidaten im Community-Points-Bereich und klickt diese nach Autorisierung automatisch
- Erfolgreich ausgeloeste Claims werden fluechtig pro Channel mitgezaehlt
- Der Counter resetet mit neuer Broadcast-Session sowie bei Stop/Reset
- Das Popup zeigt den Session-Counter pro Channel kompakt als `🎁N`

## Leitplanke
- Die Claim-Selektoren bleiben bewusst pragmatisch und DOM-abhaengig
- Falls Twitch die Struktur aendert, wird nur dieser kleine Claim-Pfad nachjustiert

## Zusatz
- Extension-Version wurde als Minor auf `0.5.0` erhoeht