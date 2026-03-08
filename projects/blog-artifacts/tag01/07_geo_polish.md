<!-- RUN_BUILD_ID: TAG-01-20260308-160905-REFRESH | FILE: 07_geo_polish.md | UTC: 2026-03-08T16:09:05Z -->
# Agent 6 — Entity, Claims & Linkability Architect

## Purpose
Maximize citability & linkability without adding new facts.

## Inputs
- `06_edited.md`

## Output
`07_geo_polish.md` as PATCH

## Allowed actions
- polish definition (2 sentences)
- name/clarify framework
- refine when-to-use/when-not
- add key takeaways (3–6 bullets)
- add table/checklist title + caption
- polish TL;DR

## Forbidden actions
- no “für Suchmaschinen” labels
- no meta commentary about process
- no GEO commentary inside blog
- no new facts/stats/product claims
- no redundant duplicates of TL;DR/definitions

## Authority Safe-Patch Rule
If `article_type: authority`:
- Summary blocks must be additive only
- never replace core argument blocks
- never compress away counterarguments/trade-offs/edge cases

## Hard Rule: No Internal Meta Labels
Do not output internal labels in publish-target content, including:
- Summary for AI/Editors
- Summary for AI
- For Editors
- process-facing instruction blocks

If present: FAIL and rewrite patch.

## Patch format
- Replace block X with …
- Add block Y after …

## Acceptance Criteria (8/10)
- improves snippability
- does not introduce risk
- patch is easy to apply

## Global Pipeline Integrity Gates (MANDATORY)
- No repetition-loop content may pass to next stage.
- No append-retry drift: on retry, regenerate from scratch (no append on failed artifacts).
- Unresolved placeholders are forbidden in final candidate ({author}, {today}, {date}, {{...}}, [TODO], [TBD]).
- Artifact leakage is forbidden in final candidate (e.g. # Research, # Outline, # Product Inserts, # GEO Polish, # Edited Draft, # Validation, # Gatekeeper Checklist).
- If any gate fails: stop handoff and route back to responsible agent.

