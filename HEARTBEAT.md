# HEARTBEAT.md - Proactive Checks

## Daily Checklist
- [x] Check VPS Disk Space (keep > 5GB free)
- [x] Verify Xvfb service is active
- [x] Check Instafollows logs for errors
- [x] Review memory files and update MEMORY.md if needed
- [ ] Every 60 minutes: run Instagram Live-Check and send status update to Mert

## Status
- Last Check: 2026-03-05 01:09 UTC ✅
- VPS Space: 17GB Free (Good) ✅
- Xvfb: Active (1 process) ✅
- Cron: Executable ✅
- Instafollows: Monitor NOT RUNNING ⚠️ (not in PM2 list)
- Instagram Scraper: Status unknown ⚠️
- X/Twitter: Needs verification
- Tareno: Needs verification
- Media Handling: Needs verification
- PM2: admin-dashboard online ✅

## Instagram Hourly Rule
- Bei Heartbeat prüfen: Ist die letzte Instagram-Statusmeldung >60 Minuten her?
- Wenn ja: `instagram-status-check` ausführen und Status mit den 2 Server-Links an Mert senden.
- Wenn nein: normaler Heartbeat ohne neue IG-Meldung.

## Letzte Aktionen
- 2026-03-11 21:58 UTC: Hourly Instagram-Status-Regel aktiviert.
- 2026-03-05 01:09 UTC: Heartbeat check — memory/2026-03-05.md created
