# Compact Pages Index

Dieser Bereich ist die dedizierte Ablage fuer nicht-blogbasierte Landing- und Compact-Page-Artefakte.

## Struktur

Alle Compact Pages liegen unter:

```text
projects/compact-pages/{brand}/{page-slug}/
```

## Kanonische Dateien pro Page

```text
{page-slug}/
├── FINAL.md      # einzige kanonische Upload-Datei
├── STATE.md      # Status fuer Redaktion und Upload
└── assets/
    └── screenshots/   # optionale Screenshots fuer Versand oder Upload-Paket
```

## Regeln

- `FINAL.md` ist immer die Single Source of Truth.
- Upload-Automation darf nur Pages mit freigegebenem `STATE.md` hochladen.
- Screenshots liegen pro Page unter `assets/screenshots/`.
- Blogs bleiben weiter unter `projects/blog-artifacts/`.
- Bottom-of-Funnel Compact Pages werden nicht mit Blog-Artefakten gemischt.

## Aktive Bereiche

- `tareno/` - Bottom-of-Funnel Compact Pages fuer Tareno
