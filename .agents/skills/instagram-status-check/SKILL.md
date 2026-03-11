---
name: instagram-status-check
description: Prüfe den Live-Login- und Session-Status der zwei Instagram-Accounts (bulifollows, bulifollows_update) mit aktuellen Screenshots und kurzer Diagnose. Verwenden bei wiederkehrenden Fragen wie „Wie sieht Instagram aus?“, „Zeig aktuellen Screenshot“, Session-Problemen, Login-Unsicherheit oder vor Status-Updates.
---

# Instagram Status Check

Führe reproduzierbare Live-Checks für beide Instagram-Accounts aus und liefere:
1) frische Screenshots, 2) klaren Login-/Session-Status, 3) kurze Handlungsempfehlung.

Wenn der User nach „aktuellem Screenshot“ fragt, immer diesen Skill-Flow verwenden und die Server-Endpunkte senden.
Wenn die IG-Kontoauswahl erscheint, automatisch „Weiter“ klicken, dann Status und Screenshot erneut bewerten.

## Workflow

1. Starte den Check-Script:
   - `node .agents/skills/instagram-status-check/scripts/check_instagram_status.js`
2. Nutze immer die **Server-Endpunkte** für das Teilen im Chat:
   - `http://31.97.32.40:3477/bulifollows-latest.png`
   - `http://31.97.32.40:3477/bulifollows_update-latest.png`
3. Lies den JSON-Report im Output-Ordner (für Diagnose):
   - Standard: `/root/.openclaw/workspace-tareno/media/instagram-status`
4. Bewerte pro Account den `state`:
   - `kontoauswahl`: Session nicht direkt im Zielkonto (Account picker)
   - `login_erforderlich`/`login_redirect`: neu einloggen nötig
   - `challenge`: Sicherheitsprüfung aktiv
   - `unbekannt_oder_eingeloggt`: manuell anhand Screenshot verifizieren
   - `error`: technischer Laufzeitfehler
4. Sende die beiden neuesten Screenshots + Kurzfazit in 2-4 Stichpunkten.

## Antwortformat (empfohlen)

- **Account 1 (bulifollows):** `<state>`
- **Account 2 (bulifollows_update):** `<state>`
- **Risiko:** niedrig/mittel/hoch
- **Nächster Schritt:** konkrete 1-Zeile

## scripts/

- `scripts/check_instagram_status.js`
  - Nutzt Playwright (iPhone-Profil), lädt Cookies aus:
    - `/root/InstaFollow/data/sessions/instagram-session.json`
    - `/root/InstaFollow/data/sessions/instagram_2.json`
  - Erstellt je Account einen Fullpage-Screenshot + JSON-Report.
