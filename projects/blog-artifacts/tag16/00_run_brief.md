# 00_run_brief.md

## A) Job Metadata
- TAG: TAG-16
- Title: TikTok Algorithm in 2026: What “Leaked Docs” Actually Mean for Predictable Growth
- Slug: tiktok-algorithmus-leaked-docs
- Language: en
- Focus keyword: tiktok algorithm leaked docs
- Secondary keywords: tiktok ranking signals, watch time distribution, completion and rewatch, content testing workflow
- Cluster/Topic: Social Media Automation & Platform Mechanics
- Search intent: Informational + Strategic + Implementation
- Audience: founders, content leads, social media managers, creator teams
- Article type: authority
- Word target: 2800 (tolerance 2550-3050)

## B) Mode Lock (Mandatory)
- MODE=CHUNKED_WRITING
- Mode must not change mid-run.

## C) Agent Execution Plan (Mandatory)

### Step 01 — Agent 0a -> 01_kb_pack.md
- Input files: TAG-16 row context, strategy docs, current gate/routing rules
- Scope constraints: compile authoritative context only; no drafting
- Hard stop conditions: missing keyword scope, unclear article promise, missing audience definition

### Step 02 — Agent 1 -> 02_research.md
- Input files: 01_kb_pack.md
- Scope constraints: source-first research with platform-native references and recent evidence
- Hard stop conditions: weak source quality, missing leaked-docs framing, no testable hypotheses

### Step 03 — Agent 2 -> 03_outline.md
- Input files: 01_kb_pack.md, 02_research.md
- Scope constraints: mandatory GEO blocks + authority depth map + topic-anchor map per H2
- Hard stop conditions: missing mandatory blocks, missing link placeholders, abstract sections without TikTok-specific anchors

### Step 04 — Agent 3 -> 04_sections/section_XX.md
- Input files: 03_outline.md
- Scope constraints: first 300 words factual; authority depth; each core section must include counterargument, trade-off, edge case, concrete scenario, misconception fix
- Hard stop conditions: repetition loops, FAQ template duplication, topic drift, missing mini-examples, under-target without new information layers

### Step 05 — Agent 4 -> 05_product_inserts.md
- Input files: 04_sections/*
- Scope constraints: product insert contract only
- Hard stop conditions: insert rule violations (count/term/length/feature mapping)

### Step 06 — Agent 5 -> 06_edited.md
- Input files: 04_sections/*, 05_product_inserts.md
- Scope constraints: claim/source validation, volatile claim rewrite, final dedupe
- Hard stop conditions: unsourced volatile claims, unresolved source placeholders, duplicate blocks

### Step 07 — Agent 6 -> 07_geo_polish.md
- Input files: 06_edited.md
- Scope constraints: patch-only GEO polish; no structural rescue
- Hard stop conditions: internal-meta leak, snippet volatility violations

### Step 08 — Sam merge -> FINAL.md
- Input files: 06_edited.md, 07_geo_polish.md, 05_product_inserts.md
- Scope constraints: deterministic merge + full reject-gate validation
- Hard stop conditions: any gate fail, placeholder/artifact leak, duplicate body merge

### Step 09 — Agent 7 -> 08_asset_plan.md (optional)
- Input files: FINAL.md
- Scope constraints: internal asset mapping only; no claim changes
- Hard stop conditions: decorative-only asset plan, policy/sensitivity issues

## D) Artifact Contract (Mandatory)
- 01_kb_pack.md: authority context package + constraints + anchor inventory
- 02_research.md: evidence base + source list + leaked-docs reliability framing
- 03_outline.md: mandatory structure + section word targets + anchor map
- 04_sections/*: section-wise authority draft files
- 05_product_inserts.md: validated product insert blocks
- 06_edited.md: publish-ready edited body
- 07_geo_polish.md: additive GEO patch only
- FINAL.md: single merged final artifact
- 08_asset_plan.md (optional): internal visual/audio plan

## E) Integrity Gates (Mandatory)
- Repetition Gate: sentence >2x or paragraph >1x -> FAIL
- FAQ Uniqueness Gate: duplicate or generic FAQ answers -> FAIL
- Topic Specificity Gate: each H2 has at least 2-3 topic anchors + 1 mini-example -> FAIL
- Placeholder/Artifact Gate: unresolved placeholders/meta headings in FINAL -> FAIL
- Outline Contract Gate: missing mandatory blocks/placeholders -> FAIL
- Product Insert Contract Gate: insert rule breach -> FAIL
- Authority Structure Gate: each core section must include counterargument + trade-off + edge case + scenario + misconception -> FAIL
- Wordcount Target Gate: authority target 2800 (2550-3050). Under target -> regenerate with new layers (examples, edge cases, trade-offs, decision rules), never repetition

## F) Failure Routing Matrix (Mandatory)
- REPETITION_GATE -> Agent 3
- FAQ_UNIQUENESS_GATE -> Agent 3
- TOPIC_DRIFT -> conditional:
  - outline missing topic anchors -> Agent 2
  - otherwise -> Agent 3
- OUTLINE_MISSING_BLOCK -> Agent 2
- OUTLINE_MISSING_LINK_PLACEHOLDER -> Agent 2
- PRODUCT_INSERT_CONTRACT_FAIL -> Agent 4
- UNSOURCED_VOLATILE_CLAIM -> Agent 5
- INTERNAL_META_LEAK_IN_PUBLISH -> Sam (Final Cleanup)
- PLACEHOLDER_ARTIFACT_GATE -> Sam (Final Cleanup)

Hard rule:
- Sam may route, validate, merge, and insert.
- Sam must not do content-authoring rescue for Writer/Outline failures.

## G) Admin Dashboard Insertion Map (Mandatory)
- Content insertion target:
  - collection: resources/blog
  - record: tiktok-algorithmus-leaked-docs
  - field: content_markdown
  - input: FINAL.md
- Metadata fields:
  - title: TikTok Algorithm in 2026: What “Leaked Docs” Actually Mean for Predictable Growth
  - slug: tiktok-algorithmus-leaked-docs
  - author: Sam / Tareno
  - last_updated: <UTC runtime timestamp>
  - language: en
- Audio attachment (if present):
  - field: audio_url
  - source: blog-audio.mp3
- Cover image:
  - field: cover_image
  - source: hero asset from 08_asset_plan.md (or manual upload)
- Asset plan storage (internal):
  - field: internal_notes or attachments/private
  - source: 08_asset_plan.md

## Acceptance Checklist
- [x] Full run is possible using only this brief
- [x] No context loss between runs
- [x] Deterministic insertion points are defined
- [x] Gates + routing are binding
- [x] Sam is orchestration-only
