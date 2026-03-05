# Tareno Tools

## Ziel
Ein dediziertes Projekt für Tooling rund um Video-Download und Delivery (Instagram zuerst, YouTube optional) für den Web/API-Use-Case.

## Bridge-Konfiguration
- `YTDLP_BRIDGE_URL=http://31.97.32.40:3477/`
- `YTDLP_BRIDGE_SECRET` wird **nicht** im Repo gespeichert (nur Runtime/Secret-Store).

## Scope v1
1. Instagram-Reel Link entgegennehmen
2. Download über Bridge
3. Telegram-kompatibel encoden (H.264/AAC, Faststart, kleinere Dateigröße)
4. Video zurückliefern

## Nächste Schritte
- API-Endpoint für tareno.co (`POST /api/video/download`)
- Queue/Worker für stabile Verarbeitung
- Optional Plattform-Autodetect (Instagram/YouTube)
