# Tareno Tools – TikTok Download Workflow (yt-dlp)

## Ziel
TikTok-Links zuverlässig herunterladen und als Telegram-kompatible MP4 bereitstellen.

## Kurzfazit (Stand)
- Direkter Download mit `yt-dlp` funktioniert.
- Wenn Bridge-Endpoint TikTok ablehnt (`Invalid Instagram URL`), liegt es an der URL-Validierung der Bridge (nicht an TikTok/yt-dlp selbst).

## Standardvorgehen

1. **Input prüfen**
   - Erlaubte TikTok-URL-Typen:
     - `https://vm.tiktok.com/...` (Shortlink)
     - `https://www.tiktok.com/@user/video/<id>`

2. **Direkt mit yt-dlp testen (ohne Bridge)**
   ```bash
   yt-dlp -f "bv*+ba/b" --merge-output-format mp4 \
     -o '/tmp/tiktok_test_%(id)s.%(ext)s' \
     'https://vm.tiktok.com/ZNRmnugpE/'
   ```

3. **Erfolg prüfen**
   - Exit-Code `0`
   - Datei vorhanden, z. B. `/tmp/tiktok_test_<id>.mp4`

4. **Telegram-Kompatibilität absichern (optional, empfohlen)**
   ```bash
   ffmpeg -y -i /tmp/tiktok_test_<id>.mp4 \
     -c:v libx264 -preset veryfast -crf 23 \
     -c:a aac -b:a 128k -movflags +faststart \
     /tmp/tiktok_test_<id>_telegram.mp4
   ```

5. **Bridge-Fall unterscheiden**
   - Falls Bridge `Invalid Instagram URL` meldet:
     - Ursache: Bridge validiert nur Instagram.
     - Aktion: Bridge-Validation auf Multi-Platform erweitern (IG + TikTok + FB).

## Typische Fehlerbilder
- `Invalid Instagram URL`
  - **Nicht** TikTok-Download-Fehler, sondern Bridge-Validation.
- TikTok-Webseite erreichbar, aber Download fehlschlägt
  - yt-dlp-Version prüfen (`yt-dlp -U`)
  - ggf. geänderte TikTok-Schutzmechanismen / Ratelimit

## Beispiel (erfolgreicher Test)
- Input: `https://vm.tiktok.com/ZNRmnugpE/`
- Aufgelöste Video-ID: `7613724318530407700`
- Download erfolgreich, Datei erzeugt in `/tmp`.

## Empfehlung für Tareno Tools
- Endpoint nicht auf Instagram-only beschränken.
- URL-Validation mit Whitelist für Domains:
  - `instagram.com`
  - `tiktok.com`, `vm.tiktok.com`
  - `facebook.com`, `fb.watch`
- Danach pro Plattform separat testen und in Logs mit `platform`-Feld kennzeichnen.
