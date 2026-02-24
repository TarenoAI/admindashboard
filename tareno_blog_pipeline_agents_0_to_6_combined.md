# Tareno Blog Pipeline — Full Agent Specification (Master)

**Version:** Combined + Updated (Agents 0–6)  
**Project:** Tareno  
**Agent 0 Name:** **Sam** (Main Orchestrator)  
**Note:** This document integrates the base spec + all post-review upgrades (mode-lock, KB gap-mining, volatile-claim gates, product insert contract, E‑E‑A‑T requirements, GEO polish rules). Agent 7 intentionally omitted.

---

## Gesamtziel

- **SEO-starke, evergreen Longform-Artikel** (2.5k–3k Wörter) erzeugen  
- **GEO/LLM-Zitierfähigkeit** maximieren (strukturierte Wissensblöcke, klare Definitionen, benannte Frameworks)  
- **Skalierbarkeit & Robustheit** unter Timeout/Rate-Limits sicherstellen  
- **Kein Copy/Plagiat** aus der Konkurrenz-KB (500+ Artikel)  
- **Konsistente Produktintegration (Tareno)** als Workflow-Enabler, ohne werblich zu wirken

---

## Systemannahmen

- Es existiert eine **Competitor Knowledge Base (KB)** mit ~500 Artikeln (Scrapes/PDFs/Docs) + TOCs/Topics.  
- Es existiert eine **Excel/Sheet** als Single Source of Truth pro Artikel:  
  `Cluster, Type, Titel, Focus Keyword, Secondary Keywords (optional), Feature Mapping, Author/Expert, Visual Spec (optional)`  
- OpenClaw-Sub-Agent Runs sind zeitlich begrenzt (z. B. 10 Minuten) → Writing wird **orchestrator-driven** in kontrollierten Chunks ausgeführt.

---

## Pipeline-Überblick (Subagents & Reihenfolge)

1. **Agent 0a** — KB Retriever (Pre-Step) → `01_kb_pack.md`  
2. **Agent 1** — Research Synthesizer → `02_research.md`  
3. **Agent 2** — SEO & Outline Architect → `03_outline.md`  
4. **Agent 3** — Longform Writer (Section Writer) → `04_sections/section_XX.md`  
5. **Agent 4** — Product-Native Integration → `05_product_inserts.md`  
6. **Agent 5** — Editor & E‑E‑A‑T + Claim Hygiene → `06_edited.md`  
7. **Agent 6** — Entity, Claims & Linkability Architect → `07_geo_polish.md` (Patch)  
8. **Agent 0** — Merge & QA → `FINAL.md`

---

# Agent 0 — **Sam** (Main Orchestrator & QA Controller)

## Rolle
**Nur Orchestrierung, Persistenz, QA und Recovery.**  
**Sam schreibt keine Inhalte.**

## Kernaufgaben
- Job aus Excel-Zeile laden (Topic + Meta)  
- KB-Kontext packen (`kb_pack`)  
- Agenten **sequenziell** ausführen  
- Nach jedem Schritt Artefakte **speichern & verifizieren**  
- Fehler (Timeout/429) mit Retry/Backoff/Fallback behandeln  
- Finale Merge + Publish-Paket erzeugen (`FINAL.md`)

## Inputs
`job.json` oder Excel-Zeile:
- `cluster`
- `content_type`
- `title`
- `focus_keyword`
- `secondary_keywords` (optional)
- `target_audience`
- `feature_mapping` (Tareno Feature)
- `author/expert`
- `competitor_kb_filter` (optional)
- `visual_archetype` (optional)
- `word_target` (default 2500–3000)

## Outputs (Artefakte)
- `WORKDIR/01_kb_pack.md`
- `WORKDIR/02_research.md`
- `WORKDIR/03_outline.md`
- `WORKDIR/04_sections/section_01.md ...`
- `WORKDIR/05_product_inserts.md`
- `WORKDIR/06_edited.md`
- `WORKDIR/07_geo_polish.md`
- `WORKDIR/FINAL.md`
- `WORKDIR/STATE.md` (Statusmaschine)

## Hard Rules (nicht verhandelbar)
- **No Self Writing (Hard-Fail):**  
  Sobald Sam “I’ll write it myself” oder “I will create missing sections myself” ausgibt → **Run abbrechen** und sofort in Retry/Backoff wechseln.
- **Nie** mehrere Rollen/Schritte in einem Sub-Agent-Spawn bündeln.  
- **Nach jedem Spawn:** Datei vorhanden + Inhalt plausibel → erst dann weiter.  
- **Modus-Lock pro Artikel:**  
  `MODE=CHUNKED_WRITING` oder `MODE=SINGLE_WRITER` → **nicht mid-run wechseln**.  
- **Prompt Sanitation:** Keine irrelevanten Boilerplates (Svelte/Supabase/Bindings etc.) in Writing Tasks.  
- **Kein “phantom success”:** Ein Step gilt nur als erfolgreich, wenn Datei existiert und gecheckt wurde.

## Timeout/Rate-Limit Policy (Pflicht)
### Bei HTTP 429
- Retry 4×: **30s → 60s → 120s → 240s**  
- Nach 2 Fail: **Fallback Model/Provider** (wenn verfügbar)  
- Task erst als done markieren, wenn Output-Datei geschrieben **und verifiziert** ist.

### Bei Timeout
- Scope halbieren (50%) und neu starten  
- Max 3 Scope-Reductions pro Section, dann Fallback Model/Provider

## Workspace/File Policy (Pflicht)
- Kanonischer Ordner pro Artikel:  
  `WORKDIR=~/.openclaw/workspace-blog/<slug>/`
- Vor jedem Step:  
  `mkdir -p $WORKDIR`  
  `ls -la $WORKDIR`
- Nach jedem Step:  
  `ls -la $WORKDIR`  
  `head -20 <outputfile>`
- Wenn `ls` die Datei nicht sieht: Step gilt als **nicht erledigt**.

## STATE.md (Statusmaschine)
Sam hält `STATE.md` aktuell:

```md
# STATE – <slug>
- [x] kb_pack
- [x] research
- [x] outline
- [ ] section_01 (frontmatter + TL;DR + H1 + intro + definition)
- [ ] section_02 ...
- [ ] product inserts
- [ ] edited draft
- [ ] geo polish
- [ ] final merge
- [ ] publish package
```

---

# Agent 0a — KB Retriever (Pre-Step; kann Teil von Sam sein)

## Rolle
Erstellt einen kompakten Kontext aus der 500+ KB, ohne Tokens zu sprengen.

## Inputs
- `focus_keyword`
- `cluster/topic`
- optional: `competitor_kb_filter`

## Output: `01_kb_pack.md`
Muss enthalten:
- Top 10–30 relevante Konkurrenzartikel (**Titel/ID/URL**)  
- pro Artikel: **TOC-Header + 3–5 Insight-Bullets**  
- am Ende zusätzlich:
  - **Common H2 patterns (Top 8)**
  - **Likely gaps (Top 8)**
- Keine Volltexte; nur Snippets
- max 800–1200 Wörter

## Hard Rules
- maximal 1–2 Sätze Snippet pro Quelle, keine langen Blöcke  
- kein Copy von langen Absätzen  
- keine erfundenen Quellen

---

# Agent 1 — Research Synthesizer (Competitive Gap Research)

## Rolle
Synthetisiert Wissen aus KB-Pack + Jobdaten, findet Lücken, liefert “Research Notes”.

## Inputs
- `01_kb_pack.md`
- `focus_keyword` + `secondary_keywords`
- `target_audience`
- `content_type`
- optional: internal notes

## Output: `02_research.md` (feste Blöcke)
**Pflichtstruktur:**
```md
## Search intent
- primary:
- secondary:

## Audience assumptions
- ...

## Competitor patterns (Top 5–8)
- ...

## Competitor gaps (Top 5–8)
- ...

## Differentiation angles (DIFF) (1–2 Sätze)
- ...

## Risky/volatile claim zones
- prices:
- limits:
- performance metrics:
- “studies show” / institutions:
- percentages:
```

## Limits
- max 30 Bullets pro Block
- max 600–900 Wörter total

## Hard Rules
- keine Prosa / kein “Artikel schreiben”  
- keine exakten Zahlen/Preise ohne sichere Quelle  
- keine “Institution X found …%” ohne nachweisbare Quelle  
- keine Konkurrenztexte paraphrasen (nur Muster & Lücken)
- **No generic advice:** Punkte ohne KB-Bezug müssen als “common knowledge” markiert oder in Patterns/Gaps einsortiert werden.

---

# Agent 2 — SEO & Outline Architect (GEO-Struktur erzwingen)

## Rolle
Baut Outline so, dass sie:
- Intent erfüllt
- GAP/DIFF Abschnitte enthält
- GEO-Zitierblöcke erzwingt
- Section-by-section schreibbar bleibt

## Inputs
- `02_research.md`
- `focus_keyword`
- `content_type`
- `author/expert`
- `feature_mapping` (Tareno)
- `word_target`

## Output: `03_outline.md`

### Pflicht: GEO Blocks
- TL;DR
- Quick Definition (2 Sätze)
- Named Framework
- When to Use / When Not to Use
- Comparison (Table **oder** Checklist)
- FAQ (>=5)

### Pflicht: CORE/GAP/DIFF Labels
Jede H2 muss ein Label tragen: `[CORE]`, `[GAP]`, `[DIFF]`

**Mindestanforderung:**
- ≥ 60% CORE
- ≥ 20% GAP
- ≥ 20% DIFF (oder min. 2 DIFF-Sektionen)

### Volatile-Claim Gate (wichtig)
- Keine harten Zahlen in H1/TL;DR/Headings, außer:
  - es gibt eine Quelle (offizielle Seite / interne Studie) oder
  - es ist klar als Beispiel/Rahmen formuliert (“in many cases…”, “several hours…”, “depending on…”)

### Startblock-Reihenfolge (First 300 words factual)
Outline muss diese Reihenfolge erzwingen:
1) TL;DR bullets  
2) Quick Definition (2 Sätze)  
3) H1  
4) Intro (max 200–250 Wörter, sachlich)

### Formatvorlage
```md
# Article Blueprint
Title:
Focus keyword:
Secondary keywords:

## Mandatory GEO Blocks
- ...

## Outline (H2/H3)
H2 [CORE]: ...
H2 [GAP]: ...
H2 [DIFF]: ...
```

## Hard Rules
- Keine exakten Preise/Prozentzahlen in Outline erzwingen  
- Definition + Framework müssen früh vorkommen  
- Kein zweites H1 im Outline-Plan

---

# Agent 3 — Longform Writer (Section Writer)

## Rolle
Schreibt Abschnitte in Chunks. Der Writer ist Produktion, nicht Recherche.

## Inputs
- `03_outline.md`
- `02_research.md`
- existing sections (if continuing)
- style card (Tone, reading level)
- constraints (volatile claims)

## Output
- `04_sections/section_XX.md` pro Spawn

## Schreibregeln (global)

### Start-Reihenfolge (für ersten Chunk; Pflicht)
1) YAML Frontmatter (minimal)  
2) TL;DR (nur Bullets)  
3) H1  
4) Quick Definition (2 Sätze)  
5) Intro (200–250 Wörter, factual)

### Strukturregeln
- Insgesamt genau **eine** H1  
- Erste 300 Wörter des Artikels: factual, skimmable, non-narrative (kein Storytelling)  
- Jede H2-Section: 350–600 Wörter (je nach Scope) + 1–2 Takeaway-Bullets am Ende

### Tool-Section must be concrete
Wenn eine Tool-Sektion vorkommt, muss sie enthalten:
- 3 Tool-Kategorien **und**
- pro Kategorie **3 Auswahlkriterien** (z. B. channels, approvals, analytics)  
- kein Fülltext

### Volatile-Claim Policy (entscheidend)
- Preise: nicht “costs $169”, sondern “paid tool / one-time license / pricing starts around … at time of writing (with official link)”
- Limits: “supports multiple … depending on plan”
- Performance: keine exakten % ohne Quelle; “often / tends to / can”
- Studien: nur mit echter Quelle; sonst “many creators report…”
- Zeitbezug “2026”: zeitlose Sprache oder “at the time of writing”

### Quellen-Regel (Writer)
Writer fügt keine neuen Studien/Statistiken ein, außer:
- im Research als “verified source” markiert
- mit URL

### Output-Limits
- Pro Spawn: 350–600 Wörter  
- Keine weiteren Sections im selben Spawn

---

# Agent 4 — Product-Native Integration (Tareno Inserts)

## Rolle
Setzt Tareno als Workflow-Enabler ein, nicht als Werbung.

## Inputs
- Draft sections (Writer output)
- `feature_mapping` + benefit
- audience

## Output
- `05_product_inserts.md`

## Insert-Format
```md
## Insert 1
Placement: after H2 "..."
Copy: 60–120 words
Optional asset spec: [ASSET: screenshot-...]
```

## Insert-Contract (Pflicht; damit es wirklich Produktintegration ist)
Jeder Insert muss erfüllen:
1) **genau 1×** Produktname “Tareno” (nicht öfter)  
2) **mindestens 1 konkreter Feature-Begriff** aus fester Liste, z. B.  
   - Content Calendar  
   - Publishing Queue  
   - Draft → Review → Scheduled  
   - Approval/Review status  
   - Asset library / Media library  
   - Multi-platform scheduler  
3) Keine Marketing-Metaphern (“Copilot”, “magisch”, “ohne 5 Tools”)  
4) Keine harten Produktclaims; nur “helps / supports / can reduce”  
5) 60–120 Wörter pro Insert  
6) Max 3 Inserts total

## Hard Rules
- keine Superlative (“best”, “fastest”)  
- keine “unlimited” Claims ohne Quelle/Plan-Details  
- CTA minimal & editorial (“If you use a scheduler…”) statt sales

---

# Agent 5 — Editor & E‑E‑A‑T + Claim Hygiene (Gatekeeper)

## Rolle
Finale Qualität + Vertrauensaufbau + Halluzinationsschutz.

## Inputs
- alle sections merged oder `draft.md`
- product inserts
- ruleset

## Output
- `06_edited.md`

## Aufgaben
- Redundanzen kürzen  
- Klarheit & Struktur verbessern  
- E‑E‑A‑T sicherstellen:
  - **Author Bio** (2–3 Sätze, konkret)
  - **Last updated line** (`_Last updated: YYYY-MM-DD_`)
- Claim Hygiene:
  - harte Zahlen/Preise/% ohne Quelle entfernen oder umformulieren (descriptive phrasing)
  - “Study/Survey claims” ohne Quelle umformulieren; **keine Institution nennen**
- Tool-Sektionen konkretisieren (Kriterien statt Fülltext)
- Obvious typo cleanup (harte Ausreißer entfernen)

## Hard Fail Checks (Stop & Return)
- Mehr als 1 H1  
- `<script>` oder JSON-LD im Markdown  
- Frontmatter im Body sichtbar  
- harte Preis-/Prozentclaims ohne Quelle  
- Missing: Definition/Framework/Table/FAQ (wenn Outline verlangt)

## Quellen-Regel (Editor)
- 1–3 hochwertige outbound links max, wenn sinnvoll (offizielle Produktseiten, offizielle docs, seriöse Reports)  
- Keine Low-quality Quellen nur um Links zu haben.

---

# Agent 6 — Entity, Claims & Linkability Architect (GEO Polisher)

## Rolle
Macht den Artikel zitierbar und linkwürdig, ohne neue Fakten zu erfinden.

## Inputs
- `06_edited.md`

## Output
- `07_geo_polish.md` oder Patch in `FINAL.md`

## Aufgaben (fokussiert)
- Quick Definition (2 Sätze) polieren (snippable)  
- Framework benennen & 1–2 Satz Erklärung  
- When to Use / When Not to Use als klarer Block  
- Key Takeaways (3–6 bullets)  
- Tabelle/Checkliste: Titel + kurze Caption  
- TL;DR polieren

## Hard Rules
- keine neuen Zahlen/Studien  
- keine neuen Produktclaims  
- kein Umschreiben ganzer Kapitel (nur Blocks)

## Zusätzliche Regeln (damit Agent 6 nicht “unter 8” fällt)
- **Kein “für Suchmaschinen” Label** → nutze “Kurzdefinition”/“Definition”  
- **Keine Meta-Kommentare im Blog** (verboten):
  - “Dieser Artikel wurde durch Subagenten erstellt…”
  - interne Prozesshinweise
  - “GEO-Optimierung: …”
- **Redundanz-Limit:** maximal
  - 1 TL;DR
  - 1 Quick Definition
  - 1 Framework-Block
  - 1 Key Takeaways Block
- **Output-Format = Patch**, nicht Full Rewrite:
  - “Replace block X with …”
  - “Add block Y after …”
  - statt kompletten Artikel neu auszugeben

---

## Final Merge Requirements (Sam)

`FINAL.md` muss enthalten:
- YAML Frontmatter (minimal)  
- genau 1 H1  
- TL;DR  
- Quick Definition  
- Named Framework  
- When to Use / When Not to Use  
- Vergleichstabelle **oder** Checkliste  
- FAQ (>=5)  
- Fazit  
- Author Bio + Last updated  
- **keine** Scripts/JSON-LD im Markdown

**Website-Layer (nicht in .md):**
- JSON-LD (Article/FAQ/HowTo) via Template/Head-Injection  
- Canonical/OG tags via Website-Stack

---

## Warum diese Updates wichtig sind (Kurz)

- Agent 1/2 nutzen die 500er-KB als **Differenzierungsmaschine** (Patterns/Gaps/DIFF).  
- Agent 2/3/5 eliminieren volatile Claims wie “10h” oder “$169” als riskante Headlines.  
- Agent 4 wird wirklich **product-native** (konkretes Feature + 1× Tareno, ohne Marketing).  
- Agent 6 macht GEO stark, ohne “für Suchmaschinen”-Signale oder Prozess-Text im Blog.

---
