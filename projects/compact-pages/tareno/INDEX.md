# Tareno Compact Pages

Dedizierter Bereich fuer Tareno Bottom-of-Funnel Compact Pages.

## Ziel

Hier liegen finale, uploadbare Compact Pages, die kein Blog-Format haben und deshalb nicht in `projects/blog-artifacts/` gehoeren.

## Ordnervertrag

Jede Page bekommt einen eigenen Ordner:

```text
projects/compact-pages/tareno/{page-slug}/
├── FINAL.md
├── STATE.md
└── assets/
```

## Upload-Gates

Ein VPS-Agent darf eine Page nur hochladen, wenn beide Bedingungen erfuellt sind:

1. In `STATE.md` steht `status: READY_FOR_UPLOAD`
2. Im YAML-Frontmatter von `FINAL.md` steht `upload_ready: true`

## Pflichtfelder in `FINAL.md`

- `project`
- `brand`
- `content_type`
- `slug`
- `route`
- `title`
- `description`
- `upload_ready`
- `last_updated`

## Konventionen

- Ordnername = `slug`
- Eine Page = ein Ordner
- Nur `FINAL.md` wird hochgeladen
- `assets/` ist optional und bleibt lokal, solange der Upload-Flow nichts anderes verlangt

## Vorlage

Die Referenzvorlage liegt unter:

```text
projects/compact-pages/tareno/_template/
```
