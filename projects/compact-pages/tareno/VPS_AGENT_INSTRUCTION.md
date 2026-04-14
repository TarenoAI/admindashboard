# Anweisung fuer den VPS-Agenten: Tareno Compact Pages hochladen

## Arbeitsverzeichnis

Wenn der Workspace auf dem VPS gespiegelt ist, liegt der Bereich hier:

```text
/root/.openclaw/workspace-tareno/projects/compact-pages/tareno
```

Lokal im Repo liegt derselbe Bereich hier:

```text
projects/compact-pages/tareno
```

## Was du hochladen sollst

Scanne alle Unterordner in `projects/compact-pages/tareno/`, aber ignoriere `_template/`.

Pro Ordner gilt:

- `FINAL.md` ist die einzige kanonische Quelldatei
- `STATE.md` entscheidet, ob Upload erlaubt ist
- `assets/screenshots/` enthaelt optionale Screenshots fuer diese Page

## Upload-Regel

Lade eine Page nur hoch, wenn beide Gates erfuellt sind:

1. In `STATE.md` steht exakt `status: READY_FOR_UPLOAD`
2. Im YAML-Frontmatter von `FINAL.md` steht `upload_ready: true`

Wenn eine dieser Bedingungen fehlt, nichts hochladen.

## So verarbeitest du eine Page

1. Oeffne `FINAL.md`
2. Parse das YAML-Frontmatter
3. Lies mindestens diese Felder aus:
   - `project`
   - `brand`
   - `content_type`
   - `slug`
   - `route`
   - `title`
   - `description`
   - `upload_ready`
   - `last_updated`
4. Nutze den Markdown-Body unterhalb des Frontmatters als Seiteninhalt
5. Pruefe, ob `assets/screenshots/` Bilddateien enthaelt
6. Lade die Page in das Tareno-Zielsystem anhand von `route` und `slug` hoch
7. Wenn Screenshots vorhanden sind, sende oder lade sie zusammen mit der Page hoch

## Harte Stop-Kriterien

Nicht hochladen, wenn:

- `FINAL.md` fehlt
- `STATE.md` fehlt
- `status` ungleich `READY_FOR_UPLOAD` ist
- `upload_ready` nicht `true` ist
- Frontmatter-Felder fehlen
- Platzhalter wie `TODO`, `TBD`, `<slug>`, `<title>` oder `{{...}}` noch vorhanden sind

## Nach erfolgreichem Upload

Aktualisiere `STATE.md` auf dieses Format:

```text
status: UPLOADED
uploaded_at: 2026-04-12T00:00:00Z
uploaded_by: vps-agent
notes: Upload completed successfully.
```

## Wenn etwas unklar ist

Dann nichts raten. Page ueberspringen und den blockierenden Grund reporten.

## Copy-Paste Prompt

```text
Arbeite im Workspace unter /root/.openclaw/workspace-tareno.

Pruefe den Ordner /root/.openclaw/workspace-tareno/projects/compact-pages/tareno.
Ignoriere _template.

Fuer jeden Page-Ordner gilt:
- FINAL.md ist die einzige kanonische Quelldatei
- STATE.md entscheidet, ob Upload erlaubt ist
- assets/screenshots/ enthaelt optionale Screenshots fuer Versand oder Upload

Lade nur dann hoch, wenn:
- in STATE.md exakt status: READY_FOR_UPLOAD steht
- in FINAL.md im YAML-Frontmatter upload_ready: true steht

Lies aus FINAL.md mindestens diese Felder:
project, brand, content_type, slug, route, title, description, upload_ready, last_updated

Nutze den Markdown-Body von FINAL.md als Seiteninhalt.
Wenn assets/screenshots/ Bilddateien enthaelt, nimm sie in dasselbe Versand-/Upload-Paket auf.
Wenn FINAL.md oder STATE.md fehlt, Pflichtfelder fehlen oder Platzhalter/TODOs enthalten sind: nichts hochladen und den Grund reporten.

Nach erfolgreichem Upload aktualisiere STATE.md auf:
status: UPLOADED
uploaded_at: <ISO timestamp>
uploaded_by: vps-agent
notes: Upload completed successfully.
```
