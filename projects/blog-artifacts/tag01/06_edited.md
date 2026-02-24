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

## Acceptance Criteria (8/10)
- clean, credible, readable
- compliant with claim policy
- includes author + update line
