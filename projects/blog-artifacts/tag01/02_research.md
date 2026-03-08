<!-- RUN_BUILD_ID: TAG-01-20260308-160905-REFRESH | FILE: 02_research.md | UTC: 2026-03-08T16:09:05Z -->
# Agent 1 — Research Synthesizer

## Purpose
Turn `kb_pack` into actionable research notes: intent, patterns, gaps, and differentiation.

## Inputs
- `01_kb_pack.md`
- job fields: focus_keyword, audience, content_type

## Output: `02_research.md` (required structure)
- Search intent (primary/secondary)
- Audience assumptions (3–6 bullets)
- Competitor patterns (Top 5–8)
- Competitor gaps (Top 5–8)
- Differentiation angle (1–2 sentences)
- Risky/volatile claim zones (prices, limits, %s, institutions)
- Mode recommendation: `article_type` = `standard` or `authority` (with 1-line reason)

## Hard Rules
- No prose article writing
- No hard numbers unless source-backed
- No competitor paraphrase; only pattern extraction
- **No generic advice**: if a bullet is not grounded in kb_pack, mark it as “common knowledge”

## Acceptance Criteria (8/10)
- gaps are specific (templates/decision trees/processes), not vague (“more depth”)
- differentiation angle is clear and usable by Agent 2
- volatile zones are explicit

## Global Pipeline Integrity Gates (MANDATORY)
- No repetition-loop content may pass to next stage.
- No append-retry drift: on retry, regenerate from scratch (no append on failed artifacts).
- Unresolved placeholders are forbidden in final candidate ({author}, {today}, {date}, {{...}}, [TODO], [TBD]).
- Artifact leakage is forbidden in final candidate (e.g. # Research, # Outline, # Product Inserts, # GEO Polish, # Edited Draft, # Validation, # Gatekeeper Checklist).
- If any gate fails: stop handoff and route back to responsible agent.

