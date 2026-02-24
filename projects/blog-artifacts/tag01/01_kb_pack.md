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
