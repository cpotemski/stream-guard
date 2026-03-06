---
title: Header-Card DOM und CSS fuer Stern-Stats neu aufgebaut (v1.0.9)
type: progress
permalink: progress/header-card-dom-und-css-fuer-stern-stats-neu-aufgebaut-v1.0.9
status: active
affected_version: 1.0.9
---

# Kontext
Die bisherige Trennung zwischen Stern und Stats via CSS-Pseudo-Element wirkte unruhig.

# Umsetzung
- Header-Card DOM fuer die Twitch-Seite neu aufgebaut:
  - `inline-header` als Card-Container
  - Stern-Button als erstes Kind
  - optionaler Stats-Block mit echter Divider-Node und Items-Wrapper
- Divider ist jetzt ein reales Element im HTML (aus Content-Script), kein `::before` mehr.
- CSS-Layout fuer beide Zustaende neu ausbalanciert (nur Stern vs. Stern+Stats):
  - kleinerer Aussenabstand links
  - leicht groessere Typografie
  - konsistente Innenabstaende
- Bei inaktivem Stern wird der Stats-Block komplett ausgeblendet.

# Geaenderte Dateien
- `extension/src/content.js`
- `extension/src/styles.css`
- `extension/manifest.json` (Version auf 1.0.9)

# Ergebnis
Die Card ist strukturell klarer und wirkt ohne Pseudo-Elemente ruhiger und gleichmaessiger.