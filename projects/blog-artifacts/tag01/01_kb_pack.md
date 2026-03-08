<!-- RUN_BUILD_ID: TAG-01-20260308-160905-REFRESH | FILE: 01_kb_pack.md | UTC: 2026-03-08T16:09:05Z -->
# Agent 0a — KB Retriever

## Purpose
Create a compact, token-efficient “KB Pack” so downstream agents can reason about competitors without ingesting 500 full articles.

## Inputs
- focus_keyword
- cluster/topic
- competitor_kb_filter (optional)

## Output: `01_kb_pack.md` (required structure)

Select the top 10–30 competitor items by relevance to the focus keyword and search intent (minimum 70% must have a clear match).

Use this exact mini-template for each source:
### Source [X]: <title>
- URL/ID: ...
- TOC:
  - ...
- Insights:
  - ...

Then summarize:
### Common H2 patterns (Top 8)
- ...
### Likely gaps (Top 8)
- ...

## Hard Rules
- No full-text dumps (no formulation > 12 words copied continuously from source)
- Max 1–2 sentence snippets per source
- No fabricated sources

## Acceptance Criteria (8/10)
- at least 10 relevant competitor items
- patterns and gaps are non-trivial and actionable
- output stays within ~800–1200 words

## Global Pipeline Integrity Gates (MANDATORY)
- No repetition-loop content may pass to next stage.
- No append-retry drift: on retry, regenerate from scratch (no append on failed artifacts).
- Unresolved placeholders are forbidden in final candidate ({author}, {today}, {date}, {{...}}, [TODO], [TBD]).
- Artifact leakage is forbidden in final candidate (e.g. # Research, # Outline, # Product Inserts, # GEO Polish, # Edited Draft, # Validation, # Gatekeeper Checklist).
- If any gate fails: stop handoff and route back to responsible agent.

