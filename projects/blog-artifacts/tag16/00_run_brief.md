# 00_run_brief.md

## A) Job Metadata
- TAG: TAG-16
- Title: TikTok Algorithm in 2026: What “Leaked Docs” Actually Mean for Predictable Growth
- Slug: tiktok-algorithmus-leaked-docs
- Language: en
- Focus keyword: tiktok algorithm leaked docs
- Secondary keywords: tiktok watch time signals, completion rate, rewatch triggers, tiktok growth workflow
- Cluster/Topic: Social Media Automation & Platform Mechanics
- Search intent: Informational + Practical Implementation
- Audience: founders, social media managers, creator teams, lean content teams
- Article type: standard
- Word target: 2500-3000

## B) Mode Lock (Mandatory)
- MODE=CHUNKED_WRITING
- Mode must not change mid-run.

## C) Agent Execution Plan (Mandatory)

### Step 01 — Agent 0a -> 01_kb_pack.md
- Input files: content plan row TAG-16, existing Tareno strategy docs, prior gate rules
- Scope constraints: only compile context and constraints; no drafting
- Hard stop conditions: missing tag metadata; missing topic scope

### Step 02 — Agent 1 -> 02_research.md
- Input files: 01_kb_pack.md
- Scope constraints: current, relevant sources; platform-specific findings; no generic filler
- Hard stop conditions: missing source links, weak evidence coverage, missing core topic entities

### Step 03 — Agent 2 -> 03_outline.md
- Input files: 01_kb_pack.md, 02_research.md
- Scope constraints: include all mandatory GEO blocks + topic anchor map + section word targets
- Hard stop conditions: missing mandatory blocks; missing link placeholders; abstract outline without anchor terms

### Step 04 — Agent 3 -> 04_sections/section_XX.md
- Input files: 03_outline.md
- Scope constraints: factual first 300 words; section-by-section writing; no append retries
- Hard stop conditions: repetition loop, FAQ duplication, low topic specificity, missing mini-examples

### Step 05 — Agent 4 -> 05_product_inserts.md
- Input files: 04_sections/*
- Scope constraints: strict product insert contract only
- Hard stop conditions: insert count/term/length violations

### Step 06 — Agent 5 -> 06_edited.md
- Input files: 04_sections/*, 05_product_inserts.md
- Scope constraints: claim/source validation, volatile claim rewrite, final dedupe pass
- Hard stop conditions: unsourced volatile claims; unresolved source requirements; duplicate blocks

### Step 07 — Agent 6 -> 07_geo_polish.md
- Input files: 06_edited.md
- Scope constraints: patch-only GEO/linkability polish; no structural rewrite
- Hard stop conditions: internal meta leakage; snippet volatility violations

### Step 08 — Sam merge -> FINAL.md
- Input files: 06_edited.md, 07_geo_polish.md, 05_product_inserts.md
- Scope constraints: deterministic merge only; run all reject gates; no content rescue writing
- Hard stop conditions: any reject gate fail, placeholder/artifact leak, duplicate body merge

### Step 09 — Agent 7 -> 08_asset_plan.md (optional)
- Input files: FINAL.md
- Scope constraints: visual mapping only; no claim/content changes
- Hard stop conditions: decorative-only assets; policy/sensitivity risks

## D) Artifact Contract (Mandatory)
- 01_kb_pack.md: consolidated context, constraints, quality targets
- 02_research.md: evidence base with source list and topic entities
- 03_outline.md: mandatory block-complete architecture + anchor map
- 04_sections/*: section drafts generated from outline intent
- 05_product_inserts.md: contract-compliant product insert blocks
- 06_edited.md: publish-ready core body after validation
- 07_geo_polish.md: additive GEO patch only
- FINAL.md: merged final publish artifact
- 08_asset_plan.md (optional): internal visual/audio mapping plan

## E) Integrity Gates (Mandatory)
- Repetition Gate: sentence >2x or paragraph >1x -> FAIL
- FAQ Uniqueness Gate: identical/near-identical FAQ answers or missing unique detail -> FAIL
- Topic Specificity Gate: per H2 at least 2-3 topic anchors + 1 mini-example -> FAIL
- Placeholder/Artifact Gate: unresolved placeholders or internal process headings in FINAL -> FAIL
- Outline Contract Gate: missing mandatory blocks/placeholders -> FAIL
- Product Insert Contract Gate: insert contract violation -> FAIL
- Wordcount integrity rule: wordcount must never be reached via repetition/filler loops; underfill must be expanded with edge case, trade-off, scenario, decision rule

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
- [x] Start-to-finish run possible with only this brief
- [x] No context loss
- [x] Deterministic insertion points
- [x] Gates + routing enforce quality
- [x] Sam is orchestration-only
