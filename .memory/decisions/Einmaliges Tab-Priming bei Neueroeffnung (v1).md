---
title: Einmaliges Tab-Priming bei Neueroeffnung (v1)
type: note
permalink: decisions/einmaliges-tab-priming-bei-neueroeffnung-v1
status: active
---

# Entscheidung
Bei neu erstellten Twitch-Watch-Tabs wird ein einmaliges Tab-Priming ausgefuehrt: Der erste neu erstellte Tab wird kurz aktiviert, nach 2 Sekunden wird auf den zuvor aktiven Tab zurueckgeschaltet.

# Warum
Beobachtetes Verhalten: Rewards/Claim-Erkennung stabilisiert sich oft erst nach initialer echter Seitenaktivierung. Ein einmaliger Fokuswechsel bildet dieses Initialisieren ohne dauerhafte Nutzerinteraktion nach.

# Grenzen (YAGNI)
- Kein permanentes Fokus-Toggling.
- Kein komplexes Scheduling.
- Bei mehreren gleichzeitig neu erstellten Tabs laeuft nur ein Priming gleichzeitig, um Tab-Flattern zu vermeiden.

# Auswirkung auf v1
Verbessert die v1-Robustheit beim Start neuer Watch-Sessions mit minimaler Zusatzlogik.