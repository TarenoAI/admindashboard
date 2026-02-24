xBeim Projekt Tareno gibt es ja auch die Subagents und ich würde gerne noch deren Rollen dort auflisten:

Agent 0 = Sam


Tareno Blog Pipeline: Full Agent Specification (Master)
Gesamtziel

SEO-starke, evergreen Longform-Artikel (2.5k–3k Wörter) erzeugen

GEO/LLM-Zitierfähigkeit maximieren (strukturierte Wissensblöcke, klare Definitionen, Frameworks)

Skalierbarkeit + Robustheit unter Timeout/Rate-Limits

Kein Copy/Plagiat aus Konkurrenz-KB

Konsistente Produktintegration (Tareno), ohne werblich zu wirken

Systemannahmen

Es existiert eine Competitor Knowledge Base (KB) mit ~500 Artikeln (Scrapes/PDFs/Docs) + TOCs/Topics.

Es existiert eine Excel/Sheet als Single Source of Truth pro Artikel (Cluster, Type, Titel, Keyword, Feature, Author, Visual Spec).

OpenClaw-Sub-Agent Runs sind zeitlich begrenzt (z. B. 10 Minuten), daher wird Orchestrator-driven chunking eingesetzt.

Agent 0: Main Orchestrator & QA Controller (Produktionsleitung)
Rolle

Nur Orchestrierung, Persistenz, QA und Recovery.
Er schreibt keine Inhalte.

Kernaufgaben

Job aus Excel-Zeile laden (Topic + Meta)

KB-Kontext packen (kb_pack)

Agenten sequenziell ausführen

Nach jedem Schritt Artefakte speichern & verifizieren

Fehler (Timeout/429) mit Retry/Backoff/Fallback behandeln

Finale Merge + Publish-Paket erzeugen (FINAL.md + ggf. assets)

Inputs

job.json oder Excel-Zeile:

cluster

content_type

title

focus_keyword

secondary_keywords (optional)

target_audience

feature_mapping (Tareno feature)

author/expert

competitor_kb_filter (optional)

visual_archetype (optional)

word_target (default 2500–3000)

Outputs (Artefakte)

WORKDIR/01_kb_pack.md

WORKDIR/02_research.md

WORKDIR/03_outline.md

WORKDIR/04_sections/section_01.md ...

WORKDIR/05_product_inserts.md

WORKDIR/06_edited.md

WORKDIR/07_geo_polish.md

WORKDIR/FINAL.md

WORKDIR/STATE.md (Statusmaschine)

Hard Rules (nicht verhandelbar)

Nie selbst schreiben (“I will write it myself” ist verboten)

Nie mehrere Rollen/Schritte in einem Sub-Agent-Spawn bündeln

Nach jedem Spawn: Datei vorhanden? Inhalt plausibel? dann erst weiter

Modus-Lock pro Artikel:

MODE=CHUNKED_WRITING oder MODE=SINGLE_WRITER

nicht mid-run wechseln

429 Policy: Retry + Backoff; kein Moduswechsel, kein Selbst-Schreiben

Prompt Sanitation: keine irrelevanten Boilerplates (Svelte/Supabase etc.) in Writing Tasks

Timeout/Rate-Limit Policy (Pflicht)

Bei HTTP 429:

retry 4x: 30s → 60s → 120s → 240s

nach 2. Fail: fallback model/provider (wenn verfügbar)

Task erst als done markieren, wenn Output-Datei geschrieben + verifiziert

Bei Timeout:

scope halbieren (50%) und neu starten

maximal 3 Scope-Reductions pro Section (dann Fallback Model)

Workspace/File Policy (Pflicht)

Ein kanonischer Ordner pro Artikel:

WORKDIR=~/.openclaw/workspace-blog/<slug>/

Vor jedem Step:

mkdir -p $WORKDIR

ls -la $WORKDIR

Nach jedem Step:

ls -la $WORKDIR

head -20 <outputfile>

Keine “phantom files”: Wenn ls sie nicht sieht, existieren sie nicht.

STATE.md (Statusmaschine)

Orchestrator hält STATE.md aktuell:

# STATE – <slug>
- [x] kb_pack
- [x] research
- [x] outline
- [ ] section_01 (frontmatter + TLDR + H1 + intro + definition)
- [ ] section_02 ...
- [ ] product inserts
- [ ] edited draft
- [ ] geo polish
- [ ] final merge
- [ ] publish package
Agent 0a: KB Retriever (Pre-Step, kann auch Teil vom Orchestrator sein)
Rolle

Erstellt einen kompakten Kontext aus der 500+ KB, ohne Tokens zu sprengen.

Inputs

focus_keyword

cluster/topic

optional: competitor_kb_filter

Output

01_kb_pack.md mit:

Top 10–30 relevant titles + URLs/IDs

pro Artikel: 3–6 Bullet-Insights (oder TOC-Header)

“common sections”, “notable angles”

keine Volltexte (nur snippets)

max 800–1200 Wörter

Hard Rules

kein Copy von langen Absätzen

nur “pattern mining”

keine erfundenen Quellen

Agent 1: Research Synthesizer (Competitive Gap Research)
Rolle

Synthetisiert Wissen aus KB-Pack + Jobdaten, findet Lücken, liefert “Research Notes”.

Inputs

01_kb_pack.md

focus_keyword + secondary_keywords

target_audience

content_type

optional: internal notes

Output

02_research.md mit festen Blöcken:

## Search intent
- primary:
- secondary:

## Audience assumptions
- ...

## Competitor patterns (what they cover)
- ...

## Competitor gaps (what they miss)
- ...

## Differentiation angles (our unique value)
- ...

## Risky/volatile claim zones
- prices:
- limits:
- performance metrics:
- “studies show”:
Limits

max 30 Bullets pro Block (nicht ausufern)

max 600–900 Wörter total

Hard Rules

keine Prosa / kein “Artikel schreiben”

keine exakten Zahlen/Preise ohne sichere Quelle

keine “Stanford research found 23% …” ohne nachweisbare Quelle

keine Konkurrenztexte paraphrasen (nur Muster & Lücken)

Agent 2: SEO & Outline Architect (GEO-Struktur erzwingen)
Rolle

Baut Outline so, dass sie:

Intent erfüllt

“GAP/DIFF” Abschnitte enthält

GEO-Zitierblöcke erzwingt

Section-by-section schreibbar bleibt

Inputs

02_research.md

focus_keyword

content_type

author/expert

feature_mapping (Tareno)

word_target

Output

03_outline.md in diesem Format:

# Article Blueprint
Title:
Focus keyword:
Secondary keywords:

## Mandatory GEO Blocks (must appear)
- TL;DR
- Quick Definition
- Named Framework
- When to Use / When not
- Comparison (table OR checklist)
- FAQ (>=5)

## Outline (H2/H3)
H2 [CORE]: ...
H2 [GAP]: ...
H2 [DIFF]: ...
...
Constraints

max 10–14 H2 insgesamt

pro H2: kurze intent-note + target keyword variant

markiert: [CORE] [GAP] [DIFF]

Hard Rules

Keine exakten Preise/Prozentzahlen in Outline erzwingen

“Definition” + “Framework” müssen früh vorkommen

Kein zweites H1 (nur später einmal)

Agent 3: Longform Writer (Section Writer)
Rolle

Schreibt Abschnitte in Chunks.
Der Writer ist “Produktion”, nicht “Recherche”.

Inputs

03_outline.md

02_research.md

existing sections (if continuing)

style card (Tone, reading level)

constraints (volatile claims)

Output

04_sections/section_XX.md pro Spawn

Schreibregeln (global)
Strukturregeln

Insgesamt genau eine H1

Erste 300 Wörter des Artikels:

factual, skimmable, non-narrative

kein Storytelling

Jede H2-Section:

350–600 Wörter (je nach Scope)

endet mit 1–2 Takeaway-Bullets

Volatile-Claim Policy (entscheidend)

Volatile Claims (Preise, Limits, % Performance, “Studie sagt”) dürfen nicht hart behauptet werden.

Preise:

statt “costs $169” → “paid tool / one-time license / pricing starts around … at time of writing (with official link)”

Limits:

statt “supports 10 accounts” → “supports multiple accounts depending on plan”

Performance:

statt “increases by 20%” → “often improves / tends to increase”

Studien:

nur wenn echte Quelle + Link, sonst neutral: “many creators report…”

Plattform “now/2026”:

zeitlose Sprache oder “at the time of writing”

Quellen-Regel (Writer)

Writer fügt keine neuen Studien/Statistiken ein, außer:

sie sind im Research als “verified source” markiert

mit URL

Sonst: “experience-based phrasing”

Output-Limits

Pro Spawn: 350–600 Wörter

Keine weiteren Sections im selben Spawn

Agent 4: Product-Native Integration (Tareno Inserts)
Rolle

Setzt Tareno als Workflow-Enabler ein, nicht als Werbung.

Inputs

Draft sections (Writer output)

feature_mapping + benefit

audience

Output

05_product_inserts.md

Format:

## Insert 1
Placement: after H2 "..."
Copy: 80–120 words
Optional asset: [ASSET: screenshot-...]
Hard Rules

keine Superlative (“best”, “fastest”)

keine “unlimited” Claims ohne Quelle/Plan-Details

max 3 Inserts

CTA minimal & editorial (“If you use a scheduler…”) statt sales

Agent 5: Editor & E-E-A-T + Claim Hygiene (Gatekeeper)
Rolle

Finale Qualität + Vertrauensaufbau + Halluzinationsschutz.

Inputs

alle sections merged oder draft.md

product inserts

ruleset

Output

06_edited.md

Aufgaben

Redundanzen kürzen

Klarheit & Struktur verbessern

E-E-A-T:

Author Bio (konkret, glaubwürdig)

Last updated line

Claim Hygiene:

harte Zahlen/Preise ohne Quelle entfernen oder umformulieren

“Study shows …” ohne Link umformulieren

Interne Links (optional): Hinweise für interne Verlinkung

Hard Fail Checks (Stop & Return)

1 H1

<script> oder JSON-LD im Markdown

Frontmatter im Body sichtbar

harte Preis-/Prozentclaims ohne Quelle

Missing: Definition/Framework/Table/FAQ (wenn Outline verlangt)

Quellen-Regel (Editor)

1–3 hochwertige outbound links max, wenn sinnvoll:

offizielle Produktseiten (OBS)

offizielle docs

seriöse Reports

Keine Low-quality Quellen nur um Links zu haben.

Agent 6: Entity, Claims & Linkability Architect (GEO Polisher)
Rolle

Macht den Artikel “zitierbar” und “linkwürdig”, ohne neue Fakten zu erfinden.

Inputs

06_edited.md

Output

07_geo_polish.md oder direkt patch in FINAL.md

Aufgaben (fokussiert)

Definition 2-Satz polieren (snippable)

Framework benennen & 1–2 Satz Erklärung

“When to Use / When not” als klarer Block

“Key Takeaways” (3–6 bullets)

Tabelle/Checkliste title + caption

TL;DR polieren

Hard Rules

keine neuen Zahlen/Studien

keine neuen Produktclaims

kein Umschreiben ganzer Kapitel (nur Blocks)







Nun kam noch hinzu: 

Agent 0 — Main Orchestrator (Orchestration + QA)
Ergänzen: Mode-Lock + „No Self Writing“ als Hard-Fail

Hard-Fail: Wenn der Orchestrator jemals “I’ll write it myself” oder “I will create missing sections myself” ausgibt → Run abbrechen und sofort in Retry/Backoff gehen.

Mode-Lock Pflicht: Pro Artikel wird ein MODE gesetzt (CHUNKED_WRITING oder SINGLE_WRITER) und darf nicht wechseln.

Ergänzen: 429/Timeout Recovery als Pflicht-Workflow

Bei 429: Retry 4× (30/60/120/240s), nach 2 Fail Model/Provider fallback.

Bei Timeout: Scope halbieren; max 3 Reductions; dann fallback.

Ergänzen: Workspace-Verifikation

Nach jedem Schritt:

ls -la $WORKDIR

head -20 <file>

Wenn ls nicht findet: step gilt als nicht erledigt, kein Weiter.

Ergänzen: Prompt-Sanitation

Jede Writing-Task wird vor Spawn geprüft:

darf keine irrelevanten Boilerplates enthalten (Svelte, Supabase, Bindings).

Wenn doch: Task-Prompt neu generieren.

Agent 0a — KB Retriever (falls separat, sonst in Agent 0)
Ergänzen: „Must include competitor patterns & gaps“

kb_pack.md muss enthalten:

Top 10–30 relevante Konkurrenzartikel (Titel/ID/URL)

pro Artikel: TOC-Header + 3–5 Insight-Bullets

zusätzlich am Ende:

Common H2 patterns (Top 8)

Likely gaps (Top 8)

Hard Rule: keine Volltexte

maximal 1–2 Sätze Snippet pro Quelle, keine langen Blöcke.

Agent 1 — Research Synthesizer
Ergänzen: Pflichtblöcke aus KB (damit Research nicht generisch wirkt)

Neu verpflichtend in 02_research.md:

Competitor Patterns (Top 5–8)

Competitor Gaps (Top 5–8)

DIFF Angle (1–2 Sätze): “Was machen wir anders/besser?”

Risky/Volatile Zones bleibt, aber konkreter: Preise, Limits, “study says”, Prozentzahlen

Ergänzen: “No generic advice” Regel

Wenn ein Punkt ohne KB-Bezug ist, muss er entweder:

als “common knowledge” markiert sein oder

in “patterns/gaps” einsortiert werden.

Agent 2 — SEO & Outline Architect
Ergänzen: CORE/GAP/DIFF Label Pflicht

Jede H2 muss ein Label tragen: [CORE], [GAP], [DIFF]

Mindestanforderung:

≥ 60% CORE

≥ 20% GAP

≥ 20% DIFF (oder 2 DIFF-Sektionen)

Ergänzen: Volatile-Claim Gate (wichtig)

Keine harten Zahlen in H1/TL;DR/Headings, außer:

es gibt eine Quelle (offizielle Seite / interne Studie) oder

es ist als Beispiel gerahmt (“in many cases…”, “several hours…”, “depending on…”)

Regel: “10h” oder “$169” darf nicht prominent in H1/TL;DR stehen.

Ergänzen: Reihenfolge für „First 300 words factual“

Outline muss Startblock erzwingen:

TL;DR bullets

Quick Definition (2 Sätze)

H1

Intro (max 200–250 Wörter, sachlich)

Agent 3 — Longform Writer
Ergänzen: Start-Reihenfolge fix (verhindert Dopplungen)

Der Writer muss beim ersten Chunk genau so beginnen:

YAML Frontmatter (minimal)

TL;DR (nur Bullets)

H1

Quick Definition (2 Sätze)

Intro (200–250 Wörter, factual)

Ergänzen: “Tool-Section must be concrete”

Wenn es eine Tool-Sektion gibt, muss sie enthalten:

3 Tool-Kategorien und

pro Kategorie 3 Auswahlkriterien (z. B. channels, approvals, analytics)

kein “Fülltext”

Ergänzen: Volatile-Claim Enforcement (bestehende Regel, aber schärfer)

Jede exakte Zahl/Preis/% ohne Quelle → automatisch weich formulieren

keine “studies show” ohne Link

keine “unlimited/best” Claims

Agent 4 — Product-Native Integration (wichtig, war unter 8)
Ersetzen/Ergänzen: Insert-Contract (damit es wirklich Produktintegration ist)

Jeder Insert muss erfüllen:

genau 1× Produktname “Tareno” (nicht öfter)

mindestens 1 konkreter Feature-Begriff aus einer festen Liste (z. B. “Content Calendar”, “Publishing Queue”, “Draft → Review → Scheduled”, “Approval/Review status”, “Asset library”, “Multi-platform scheduler”)

keine Marketing-Metaphern (“Copilot”, “magisch”, “ohne 5 Tools”)

keine harten Produktclaims, nur “helps”, “supports”, “can reduce”

60–120 Wörter pro Insert

Ergänzen: Insert 2 & 3 müssen Tareno nennen

Aktuell sind 2 und 3 “generic”. Regel sorgt dafür, dass sie nicht mehr generisch bleiben.

Agent 5 — Editor & E-E-A-T + Claim Hygiene
Ergänzen: Autorbox + Last Updated (Pflicht)

Am Ende muss immer stehen:

## Über den Autor (2–3 Sätze, konkret)

_Last updated: <YYYY-MM-DD>_

Ergänzen: “Obvious typo cleanup”

Minimum-Typos entfernen (“Orken”-Art)

Kein Perfekt-Lektorat, aber harte Ausreißer müssen weg.

Ergänzen: Claim Hygiene Gate (bereits gut, aber formal)

Exakte Zahlen/Preise/% ohne Quelle → rewrite to descriptive phrasing

“Study/Survey claims” ohne Quelle → rewrite, keine Institution nennen

Optional: max 1–3 outbound links, nur wenn wirklich hilfreich

Agent 6 — Entity & Linkability Architect (wichtig, war unter 8)
Ersetzen: Kein “für Suchmaschinen” Label

Entferne “Definition für Suchmaschinen”

Nutze stattdessen: “Kurzdefinition” oder “Definition”

Ergänzen: Keine Meta-Kommentare im Blog

Verboten im finalen Artikel:

“Dieser Artikel wurde durch Subagenten erstellt…”

interne Prozesshinweise

“GEO-Optimierung: …”
Diese Dinge dürfen nur intern im QA-Report stehen, nicht im Blog.

Ergänzen: Redundanz-Limit

Agent 6 darf nicht TL;DR + 2 Definitionsblöcke gleichzeitig verdoppeln.

Maximal:

1 TL;DR

1 Quick Definition

1 Framework-Block

1 Key Takeaways Block

Ändern: Output-Format = Patch, nicht Full Rewrite

Agent 6 liefert:

“Replace block X with …”

“Add block Y after …”
statt “FINAL Artikel komplett neu”.

Kurz: Was bringen diese Änderungen?

Agent 1/2 nutzen die 500er-KB wirklich als Differenzierungsmaschine (statt generisch).

Agent 2/3/5 eliminieren volatile Claims wie “10h” als riskante Headline-Zahl.

Agent 4 wird wirklich product-native (nicht nur allgemeiner Rat).

Agent 6 macht GEO stark, ohne peinliche “für Suchmaschinen”-Signale oder Prozess-Text.