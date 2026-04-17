# Browser Session

Dieses Repo hat eine dedizierte Browser-Session mit persistentem Profil im Projektverzeichnis.

## Zweck

- lokale `Stream Guard`-Extension in einem persistenten Repo-Profil verwenden
- Twitch-Login zwischen Sessions behalten
- Twitch ist auf Browser-Site-Ebene standardmaessig stummgeschaltet
- Testzustand reproduzierbar im Repo halten statt in einem globalen Browserprofil
- nutzt eine lokal installierte normale Browser-App statt Test-Chromium

## Pfade

- Profil: `.local/browser-profile/`
- Extension: `extension/`

## Befehle

```bash
npm run browser:session
```

Falls du mit einem komplett frischen Profil starten willst:

```bash
npm run browser:session:reset
```

## Einmalige manuelle Schritte

1. `npm run browser:session` starten.
2. Bei Twitch einloggen.
3. Falls die Extension noch nicht in diesem Profil installiert ist: `npm run browser:extensions` starten oder `chrome://extensions/` öffnen und `Load unpacked` mit `extension/` auswaehlen.
4. Browser wieder schließen.

Danach kann dieselbe Session erneut gestartet werden; Login und Browserzustand bleiben im Projektprofil erhalten.

## Browserwahl

Der Launcher nutzt bevorzugt:

- Google Chrome
- Brave Browser

Falls du einen anderen expliziten Browserpfad nutzen willst:

```bash
STREAM_GUARD_BROWSER_PATH="/Pfad/zum/Browser" npm run browser:session
```

## Hinweis

Das Profilverzeichnis ist absichtlich in `.gitignore`, damit keine persönlichen Sessiondaten ins Repository gelangen.
Die Extension wird jetzt bewusst nicht mehr per Start-Flag injiziert. Grund: In der echten Chrome-Session war dieses Verhalten auf macOS nicht verlaesslich sichtbar bzw. nachvollziehbar. Stattdessen wird sie einmal manuell als unpacked Extension in das persistente Repo-Profil geladen und bleibt dann dort erhalten.
Der Launcher schreibt ausserdem eine Browser-Profileinstellung, die `twitch.tv` als Website stummschaltet. Das betrifft nur die Browser-Site-Audioebene; die Extension kann den Twitch-Player im Tab weiterhin auf `unmuted` setzen.
