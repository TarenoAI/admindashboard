<!-- RUN_BUILD_ID: TAG-01-20260308-160905-REFRESH | FILE: 05_product_inserts.md | UTC: 2026-03-08T16:09:05Z -->
# Agent 4 — Product-Native Integration

## Purpose
Place Tareno as a workflow enabler without sounding like an ad.

## Inputs
- Draft sections
- feature mapping + benefit
- audience

## Output
`05_product_inserts.md` (max 3 inserts)

## Insert Contract
Each insert must:
1) mention “Tareno” exactly once
2) include at least one concrete feature term (Content Calendar, Publishing Queue, Draft->Review->Scheduled, Approval status, Media library, Multi-platform scheduler)
3) avoid marketing metaphors
4) avoid hard claims; use helps/supports/can reduce
5) be 60–120 words
6) include exact placement reference

## Hard Fail Rule
If no explicit feature term is present in an insert -> FAIL and regenerate insert.

## Social/Instagram Free-Tools Block (MANDATORY)
If article topic is Instagram/Social, append at end:
`## Free Tools (Quick Links)` with 3-5 Tareno free tools.
Each entry must include:
- tool name
- one-line practical use case
- direct link placeholder/reference

## Acceptance Criteria (8/10)
- reads editorial
- names one real feature
- avoids hype and unverifiable claims

## Global Pipeline Integrity Gates (MANDATORY)
- No repetition-loop content may pass to next stage.
- No append-retry drift: on retry, regenerate from scratch (no append on failed artifacts).
- Unresolved placeholders are forbidden in final candidate ({author}, {today}, {date}, {{...}}, [TODO], [TBD]).
- Artifact leakage is forbidden in final candidate (e.g. # Research, # Outline, # Product Inserts, # GEO Polish, # Edited Draft, # Validation, # Gatekeeper Checklist).
- If any gate fails: stop handoff and route back to responsible agent.

