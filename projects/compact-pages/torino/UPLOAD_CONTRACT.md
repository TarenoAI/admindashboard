# Torino Compact Page Upload Contract

## Zweck

Dieser Vertrag definiert, welche Datei fuer eine Torino Compact Page kanonisch ist und welche Metadaten der Upload-Agent auslesen muss.

## Kanonisches Artefakt

- Datei: `FINAL.md`
- Ort: `projects/compact-pages/torino/{page-slug}/FINAL.md`
- Bedeutung: Die Datei ist publish-ready und ersetzt alle frueheren Zwischenstaende.

## Statusdatei

- Datei: `STATE.md`
- Ort: `projects/compact-pages/torino/{page-slug}/STATE.md`
- Bedeutung: Steuert, ob Upload erlaubt ist.

## Erlaubte Upload-Voraussetzungen

Ein Upload ist nur erlaubt, wenn:

1. `STATE.md` den Status `READY_FOR_UPLOAD` traegt
2. `FINAL.md` `upload_ready: true` im YAML-Frontmatter setzt
3. `FINAL.md` keine Platzhalter wie `<slug>`, `<title>`, `TODO`, `TBD` oder `{{...}}` enthaelt

## YAML-Frontmatter fuer `FINAL.md`

Minimal erforderlich:

```yaml
project: torino
brand: torino
content_type: bof_compact_page
slug: example-slug
route: /example-route
title: Example Title
description: Short search/snippet description.
upload_ready: true
last_updated: 2026-04-12
```

## Body-Vertrag fuer `FINAL.md`

Der Body soll kompakt und publish-ready sein. Minimum:

- genau 1 H1
- kurze Einleitung
- Problem oder Kaufmotiv
- klare Solution-Fit-Sektion
- CTA-Block
- FAQ oder Einwandbehandlung

## Upload-Verhalten

- Nutze `slug` und `route` aus dem Frontmatter als Zielreferenz.
- Lade nur den Body-Inhalt plus Frontmatter-Metadaten aus `FINAL.md` hoch.
- Ignoriere `_template/`.
- Ueberspringe Pages ohne freigegebenen Status.
- Bei fehlenden Pflichtfeldern: stoppe und melde die Page als blockiert.

## Nach erfolgreichem Upload

`STATE.md` soll aktualisiert werden auf:

```text
status: UPLOADED
uploaded_at: YYYY-MM-DDTHH:MM:SSZ
uploaded_by: <agent-name>
```
