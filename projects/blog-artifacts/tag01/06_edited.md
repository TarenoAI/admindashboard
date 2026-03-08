<!-- RUN_BUILD_ID: TAG-01-20260308-160905-REFRESH | FILE: 06_edited.md | UTC: 2026-03-08T16:09:05Z -->
# Agent 5 — Editor & E-E-A-T + Claim Hygiene

## Purpose
Editorial quality pass + trust signals + claim safety.

## Inputs
- merged draft + inserts

## Output
`06_edited.md`

## Mandatory tasks
- tighten structure, remove redundancies
- enforce volatile-claim policy (rewrite brittle claims)
- ensure tool sections are concrete (criteria)
- remove obvious typos
- add **Author bio** + **Last updated**

## Hard fail checks
- >1 H1
- scripts/JSON-LD in markdown
- frontmatter rendered in body
- exact prices/percent claims without sources
- missing mandatory blocks

## Authority Preservation Rule
If `article_type: authority`:
- dedupe only exact duplicates / near-verbatim loops
- keep counterargument blocks
- keep trade-off sections
- keep edge-case passages
- do not flatten analytical depth into short support-style prose

## Social/Instagram Free-Tools Check
If topic is Instagram/Social:
- ensure final body includes `Free Tools (Quick Links)` block
- ensure 3-5 tools are present with one-line practical use each

## Acceptance Criteria (8/10)
- clean, credible, readable
- compliant with claim policy
- includes author + update line

## Global Pipeline Integrity Gates (MANDATORY)
- No repetition-loop content may pass to next stage.
- No append-retry drift: on retry, regenerate from scratch (no append on failed artifacts).
- Unresolved placeholders are forbidden in final candidate ({author}, {today}, {date}, {{...}}, [TODO], [TBD]).
- Artifact leakage is forbidden in final candidate (e.g. # Research, # Outline, # Product Inserts, # GEO Polish, # Edited Draft, # Validation, # Gatekeeper Checklist).
- If any gate fails: stop handoff and route back to responsible agent.

