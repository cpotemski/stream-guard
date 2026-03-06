---
title: Alle neuen Watch-Tabs genau einmal primen (v1)
type: note
permalink: decisions/alle-neuen-watch-tabs-genau-einmal-primen-v1
status: active
---

# Entscheidung
Das Tab-Priming fuer neue Watch-Tabs erfolgt nicht nur einmal global, sondern pro neuem Tab genau einmal.

# Warum
Beim Aktivieren der Extension koennen 2-3 Streams gleichzeitig starten. Damit jeder Stream die gleiche Initialisierungs-Chance hat, muss jeder neu erzeugte Watch-Tab einmal geprimed werden.

# Umsetzung (YAGNI)
- Einfache Prime-Queue im Tab-Manager.
- Jeder neue Tab wird dedupliziert in die Queue aufgenommen.
- Tabs werden sequentiell geprimed (kurz aktivieren, 2s warten).
- Kein Ruecksprung auf vorherigen Tab.

# v1-Effekt
Vorhersagbares Startverhalten ohne Overengineering; jeder neue Stream durchlaeuft den gleichen Priming-Schritt.