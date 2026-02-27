# InstaFollow - Project Focus

## Project Status
- **State:** Stable, running via cron.
- **Twitter Posting:** Restored and active.
- **Workspace:** `/root/InstaFollow` (Primary) / `/root/insta-follows` (Backup/Old).

## Technical Details
- **Main Script:** `scripts/monitors/smart-monitor-v4.ts`
- **Database:** Turso (libsql).
- **Session:** Firefox Persistent Profile for Twitter; Chromium for Instagram.
- **Cron Jobs:** 
    - Monitor: Every hour (`run-monitor.sh`).
    - Queue: Every 20 mins (`run-queue-processor.sh`).

## Maintenance
- Watch out for `.monitor.lock` (now in `.gitignore`).
- If Twitter session fails, login via VNC is required.
