# 00_run_brief.md

## A) Job Metadata
- TAG: TAG-18
- Title: Instagram SEO in Practice: Why Keywords Usually Outperform Hashtag-Only Strategies
- Slug: instagram-seo-keywords-statt-hashtags
- Language: en
- Focus keyword: instagram seo keywords vs hashtags
- Secondary keywords: instagram search signals, profile keyword optimization, caption intent, hashtag layering strategy
- Cluster/Topic: Content Repurposing & Organic Discovery Systems
- Search intent: Informational + Advanced Implementation
- Audience: creators, social media managers, growth leads, lean marketing teams
- Article type: authority
- Word target: 2800 (tolerance 2550-3050)

## B) Mode Lock (Mandatory)
- MODE=CHUNKED_WRITING
- Mode must not change mid-run.

## C) Agent Execution Plan (Mandatory)

### Step 01 — Agent 0a -> 01_kb_pack.md
- Input files: TAG-18 plan row, strategy docs, gate policy
- Scope constraints: context pack only; no drafting
- Hard stop conditions: missing keyword scope, missing audience or outcome definition

### Step 02 — Agent 1 -> 02_research.md
- Input files: 01_kb_pack.md
- Scope constraints: source-backed research on Instagram search behavior, keyword placement, hashtag role, and measurement
- Hard stop conditions: weak source reliability, missing topic anchors, no practical test hypotheses

### Step 03 — Agent 2 -> 03_outline.md
- Input files: 01_kb_pack.md, 02_research.md
- Scope constraints: full mandatory GEO blocks + authority depth plan + topic-anchor mapping per H2
- Hard stop conditions: missing mandatory blocks/placeholders, abstract outline, no comparison/workflow block

### Step 04 — Agent 3 -> 04_sections/section_XX.md
- Input files: 03_outline.md
- Scope constraints: first 300 words factual, authority depth, concrete Instagram-specific mechanisms, no append retries
- Hard stop conditions: repetition loops, FAQ duplication, topic drift, missing mini-examples, under-target without new information layers

### Step 05 — Agent 4 -> 05_product_inserts.md
- Input files: 04_sections/*
- Scope constraints: product insert contract only
- Hard stop conditions: insert count/term/length violations

### Step 06 — Agent 5 -> 06_edited.md
- Input files: 04_sections/*, 05_product_inserts.md
- Scope constraints: source/claim validation, volatile claim rewrite, dedupe pass, final-contract precheck
- Hard stop conditions: unsourced volatile claims, unresolved placeholders, duplicated blocks

### Step 07 — Agent 6 -> 07_geo_polish.md
- Input files: 06_edited.md
- Scope constraints: patch-only GEO polish; no body rescue
- Hard stop conditions: internal meta leak, snippet volatility violations

### Step 08 — Sam merge -> FINAL.md
- Input files: 06_edited.md, 07_geo_polish.md, 05_product_inserts.md
- Scope constraints: deterministic merge + reject-gate validation
- Hard stop conditions: any reject-gate fail, final-contract block missing, placeholder/artifact leak

### Step 09 — Agent 7 -> 08_asset_plan.md (optional)
- Input files: FINAL.md
- Scope constraints: internal asset mapping only
- Hard stop conditions: decorative-only mapping, policy/sensitivity issues

## D) Artifact Contract (Mandatory)
- 01_kb_pack.md: authority context + constraints + anchor inventory
- 02_research.md: evidence base + source notes + reliability framing
- 03_outline.md: mandatory structure + anchor map + section word targets
- 04_sections/*: authority section drafts with mechanism + mini-example per section
- 05_product_inserts.md: contract-compliant inserts
- 06_edited.md: publish-ready edited article
- 07_geo_polish.md: additive GEO patch only
- FINAL.md: merged final artifact
- 08_asset_plan.md (optional): internal visual/audio plan

## E) Integrity Gates (Mandatory)
- Repetition Gate: sentence >2x or paragraph >1x -> FAIL
- FAQ Uniqueness Gate: duplicate/generic FAQ answers or missing unique detail -> FAIL
- Topic Specificity Gate: per H2 at least 2-3 topic anchors + 1 mini-example -> FAIL
- Placeholder/Artifact Gate: unresolved placeholders or internal process headings in FINAL -> FAIL
- Final Contract Block Gate: missing YAML frontmatter / TL;DR / Key Takeaways -> FAIL
- Outline Contract Gate: missing mandatory blocks/placeholders -> FAIL
- Product Insert Contract Gate: insert rule breach -> FAIL
- Authority Structure Gate: each core section includes counterargument + trade-off + edge case + scenario + misconception
- Wordcount Target Gate: authority target 2800 (2550-3050); under target -> regenerate via examples/edge cases/trade-offs/decision rules (never repetition)

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
- FINAL_CONTRACT_BLOCK_MISSING -> Agent 5 (default) or Agent 3 if section-level root cause
- INTERNAL_META_LEAK_IN_PUBLISH -> Sam (Final Cleanup)
- PLACEHOLDER_ARTIFACT_GATE -> Sam (Final Cleanup)

Hard rule:
- Sam may route, validate, merge, and insert.
- Sam must not do content-authoring rescue for Writer/Outline failures.

## G) Admin Dashboard Insertion Map (Mandatory)
- Content insertion target:
  - collection: resources/blog
  - record: instagram-seo-keywords-statt-hashtags
  - field: content_markdown
  - input: FINAL.md
- Metadata fields:
  - title: Instagram SEO in Practice: Why Keywords Usually Outperform Hashtag-Only Strategies
  - slug: instagram-seo-keywords-statt-hashtags
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
- [x] Full run possible with only this brief
- [x] No context loss
- [x] Deterministic insertion points defined
- [x] Gates + routing binding
- [x] Sam orchestration-only
