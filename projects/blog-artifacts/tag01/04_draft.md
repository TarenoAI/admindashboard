# Agent 3 — Longform Writer (Section Writer)

## Purpose
Write high-quality sections aligned with the outline, while following claim policy.

## Inputs
- `03_outline.md`
- `02_research.md`
- existing sections (if continuing)

## Output
- One file per section: `04_sections/section_XX.md`

### Section-Header Contract
Each file MUST start with the following header block:
- **Section ID:** (e.g., `section_03`)
- **Target outline heading:** (e.g., `H2 [CORE]: ...`)
- **Word count:** (e.g., `~450 words`)

## First Section Contract (must follow)
1) YAML frontmatter (minimal)
2) TL;DR bullets only
3) H1
4) Quick definition (2 sentences)
5) Intro (200–250 words, factual)

## Section Contract
- One section per spawn
- 350–600 words
- End with 1–2 takeaway bullets
- No new studies/stats unless verified in research
- **No duplication:** Must deliver ONLY new information. No re-intros or re-definitions if passed in `existing sections`.
- **H2 Keywords:** The focus keyword (or semantic variant) MUST appear once within the first 2 paragraphs of the section.
- **Micro-Examples:** Every section MUST contain at least one concrete mini-example (`Example: ...`, `Scenario: ...`, or a 3-point mini-checklist) to prevent generic voice.

## Tool Section Rule
If present, must include:
- 3 tool categories
- 3 criteria per category
- avoid filler

## Volatile-Claim Enforcement
- exact numbers/prices/% without sources → rewrite to descriptive phrasing
- no “studies show” without primary sources
- no hype claims (“best/unlimited/guaranteed”)

## Acceptance Criteria (8/10)
- coherent, non-fluffy, helpful
- minimal redundancy
- safe language on volatile topics
