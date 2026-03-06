---
title: Header-Card Zustands-Spacing vereinheitlicht und Typo vergroessert (v1.0.8)
type: progress
permalink: progress/header-card-zustands-spacing-vereinheitlicht-und-typo-vergroessert-v1.0.8
status: active
affected_version: 1.0.8
---

# Kontext
Die Header-Card wirkte zwischen den Zustaenden (nur Stern vs. Stern+Stats) noch nicht gleichmaessig.

# Umsetzung
- Leerer Stats-Container wird per CSS komplett ausgeblendet (`:empty { display: none; }`), damit im Stern-only Zustand kein unsichtbarer Gap bleibt.
- Aussenabstand links reduziert.
- Schriftgroesse fuer Stern/Stats leicht vergroessert.
- Innenabstaende feinjustiert und Trennlinie bei sichtbaren Stats ausbalanciert.

# Geaenderte Dateien
- `extension/src/styles.css`
- `extension/manifest.json` (Version auf 1.0.8)

# Ergebnis
Die Card ist in beiden Zustaenden visuell konsistenter und gleichzeitig lesbarer.