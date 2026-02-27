# Sam's Selbstverbesserungs-Regeln (Self-Improving Agent)
*Stand: 2026-02-23 | Letzte Aktualisierung durch Benutzer-Feedback*

---

## 1. PRE-FLIGHT CHECK (Pflicht vor jedem Artikel)

### Schritt 1: Richtlinien lesen (Read-Only)
- [ ] Lese zuerst die Agenten-Richtlinien (z.B. `agents/tarenoblog.md`)
- [ ] Prüfe auf neue Vorgaben/Änderungen
- [ ] Verändere NIEMALS die .md-Regeldateien selbst

### Schritt 2: Subagenten briefen (Prompting)
- [ ] Injiziere aktuelle Richtlinien in den Start-Prompt
- [ ] Übergebe explizit: "Du arbeitest nach den Regeln aus [Datei]"

### Schritt 3: Reihenfolge beachten
```
Richtlinie lesen → Neuigkeiten prüfen → Subagenten briefen → Task starten
```

---

## 2. STRICT SEPARATION OF CONCERNS

### VERBOTEN (Niemals tun):
- [ ] Agenten-Richtlinien ändern (alles in `.agents/`, `.agent/`, `skills/`)
- [ ] System-Prompts umschreiben
- [ ] Skill-Definitionen verändern
- [ ] `BLOG_BLUEPRINT.md` oder `AGENT_GUIDE.md` modifizieren

### ERLAUBT (Nur hier):
- [ ] Blog-Artefakte in `CONTENT_PIPELINE/[ARTIKEL_ID]/`
- [ ] Tages-Ordner: `tag01/`, `tag02/`, etc.
- [ ] Ausgabe-Dateien: `01_research_*.md`, `02_outline_*.md`, etc.
- [ ] Content in Dashboard Knowledge Base (als separate Einträge)

---

## 3. CONTENT PIPELINE WORKFLOW

### Ordner-Struktur pro Artikel:
```
CONTENT_PIPELINE/
└── [ARTIKEL_ID]_seo_bio_optimization/
    ├── 01_research_[id].md      # Agent 1
    ├── 02_outline_[id].md       # Agent 2
    ├── 03_section_001_[id].md   # Agent 3 - Pain
    ├── 03_section_002_[id].md   # Agent 3 - Proof
    ├── 03_section_003_[id].md   # Agent 3 - Solution
    ├── ...                      # Weitere Sections
    ├── 04_product_[id].md       # Agent 4
    ├── 05_edited_[id].md        # Agent 5
    └── 06_final_[id].md         # Agent 6
```

### Upload zu Dashboard:
**Format:** `[ARTIKEL_ID] | [AGENT] | [STATUS]`
- `001-BIO-LINK | AGENT-1 | PENDING_REVIEW`
- `001-BIO-LINK | AGENT-2 | PENDING_REVIEW`
- usw.

---

## 4. SUBAGENTEN ORDNUNG

| Agent | Name | Output | Reihenfolge |
|-------|------|--------|-------------|
| 1 | Research Synthesizer | 01_research.md | Muss zuerst |
| 2 | SEO & Outline Architect | 02_outline.md | Wartet auf Agent 1 |
| 3 | Longform Writer | 03_section_X.md | Wartet auf Agent 2 |
| 4 | Product-Native Integration | 04_product.md | Parallel zu Writer |
| 5 | Editor & E-E-A-T | 05_edited.md | Wartet auf Agent 3 |
| 6 | Entity/Linkability | 06_final.md | Wartet auf Agent 5 |

**Regel:** Niemals Agent 3 starten, bevor Agent 1+2 nicht freigegeben!

---

## 5. LEARNINGS AUS FEHLERN

### Fehler 1: Originale überschrieben?
**Was passierte:** Benutzer dachte, ich hätte `blog-artifacts/tag01/` geändert.
**Realität:** Neue Dateien waren in separatem Ordner.
**Lösung:** Immer explizit bestätigen: "Originale unberührt, neue Dateien in [PFAD]"

### Fehler 2: Uploads nicht korrekt zugeordnet?
**Was passierte:** Dashboard-Einträge nicht klar nach Agenten sortiert.
**Lösung:** Format `[ARTIKEL_ID] | [AGENT] | [STATUS]` strikt einhalten.

### Fehler 3: Deutsches vs. Englisches Konzept verwechselt?
**Was passierte:** Die "Content Pipeline" wurde anders interpretiert.
**Lösung:** VOR jedem Upload explizit nach Bestätigung fragen.

---

## 6. VERBESSERUNGSSCHLEIFE

Nach jedem Artikel:
1. Review durch Benutzer abwarten
2. Feedback notieren
3. Diese Datei aktualisieren
4. Nächsten Artikel besser starten

---

## 7. GOLDENE REGELN

1. **Richtlinien lesen** → Dann erst handeln
2. **Subagenten briefen** → Mit aktuellen Regeln
3. **Strikte Trennung** → Regeln vs. Output
4. **Klare Ordner** → Nie mischen
5. **Upload Format** → [ID] | [AGENT] | [STATUS]
6. **Warte auf Freigabe** → Nächster Agent erst nach GO

---

*Diese Datei wird nach jedem Feedback aktualisiert und verbessert.*
*Letzte Lektion: Richtlinien-VORHER lesen, nie annehmen dass sie gleich sind.*
