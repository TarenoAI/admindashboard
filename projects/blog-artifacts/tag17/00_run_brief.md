# 00_run_brief.md

## A) Job Metadata
- TAG: TAG-17
- Title: Video-to-Blog Workflow: Turn YouTube Videos into Search-Intent Articles That Rank
- Slug: video-zu-text-youtube-blog
- Language: en
- Focus keyword: youtube video to blog workflow
- Secondary keywords: transcript to article, search intent mapping, semantic section structure, repurposing workflow
- Cluster/Topic: Content Repurposing & Multi-Channel Systems
- Search intent: Informational + Advanced Implementation
- Audience: founders, SEO/content leads, editorial teams, content ops managers
- Article type: authority (advanced)
- Word target: 2800 (tolerance 2550-3050)

## B) Mode Lock (Mandatory)
- MODE=CHUNKED_WRITING
- Mode must not change mid-run.

## C) Agent Execution Plan (Mandatory)

### Step 01 — Agent 0a -> 01_kb_pack.md
- Input files: TAG-17 row, strategy docs, gate/routing policy
- Scope constraints: context pack only; no article drafting
- Hard stop conditions: missing intent/audience clarity, undefined outcome promise

### Step 02 — Agent 1 -> 02_research.md
- Input files: 01_kb_pack.md
- Scope constraints: source-backed research on video-to-blog transformation, SEO intent handling, editing workflows
- Hard stop conditions: weak source quality, no testable claims, missing topic anchor inventory

### Step 03 — Agent 2 -> 03_outline.md
- Input files: 01_kb_pack.md, 02_research.md
- Scope constraints: mandatory GEO blocks + authority depth map + anchor terms per H2 + section word targets
- Hard stop conditions: missing mandatory blocks/placeholders, outline abstraction, no comparison/workflow block

### Step 04 — Agent 3 -> 04_sections/section_XX.md
- Input files: 03_outline.md
- Scope constraints: factual first 300 words, authority depth, section-level specificity, no append retries
- Hard stop conditions: repetition loop, generic FAQ answers, missing mini-examples, topic drift, under-target without new information layers

### Step 05 — Agent 4 -> 05_product_inserts.md
- Input files: 04_sections/*
- Scope constraints: product insert contract only
- Hard stop conditions: count/term/length rule violations

### Step 06 — Agent 5 -> 06_edited.md
- Input files: 04_sections/*, 05_product_inserts.md
- Scope constraints: claim/source validation, volatile claim rewrite, dedupe pass, final-contract precheck
- Hard stop conditions: unsourced volatile claims, unresolved placeholders, duplicate blocks

### Step 07 — Agent 6 -> 07_geo_polish.md
- Input files: 06_edited.md
- Scope constraints: patch-only GEO optimization; no content rescue
- Hard stop conditions: internal meta leak, snippet volatility violations

### Step 08 — Sam merge -> FINAL.md
- Input files: 06_edited.md, 07_geo_polish.md, 05_product_inserts.md
- Scope constraints: deterministic merge + full reject-gate validation
- Hard stop conditions: any reject gate fail, final contract block missing, placeholder/artifact leak

### Step 09 — Agent 7 -> 08_asset_plan.md (optional)
- Input files: FINAL.md
- Scope constraints: asset mapping only; no claim/content changes
- Hard stop conditions: decorative-only assets, policy/sensitivity issues

## D) Artifact Contract (Mandatory)
- 01_kb_pack.md: advanced context, constraints, anchor inventory
- 02_research.md: evidence base + source list + method notes
- 03_outline.md: mandatory structure + anchor map + authority section targets
- 04_sections/*: section drafts with unique mechanism + example per section
- 05_product_inserts.md: contract-compliant inserts
- 06_edited.md: publish-ready edited text
- 07_geo_polish.md: additive GEO patch only
- FINAL.md: single merged final artifact
- 08_asset_plan.md (optional): internal visual/audio plan

## E) Integrity Gates (Mandatory)
- Repetition Gate: sentence >2x or paragraph >1x -> FAIL
- FAQ Uniqueness Gate: duplicate/generic answers or no unique detail -> FAIL
- Topic Specificity Gate: per H2 at least 2-3 topic anchors + 1 mini-example -> FAIL
- Placeholder/Artifact Gate: unresolved placeholders or internal process headings in FINAL -> FAIL
- Final Contract Block Gate: missing YAML frontmatter / TL;DR / Key Takeaways -> FAIL
- Outline Contract Gate: missing mandatory blocks/placeholders -> FAIL
- Product Insert Contract Gate: insert rule breach -> FAIL
- Authority Structure Gate: each core section must include counterargument + trade-off + edge case + scenario + misconception
- Wordcount Target Gate: authority target 2800 (2550-3050); under target -> regenerate with new layers (examples, edge cases, trade-offs, decision rules), never repetition

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
- FINAL_CONTRACT_BLOCK_MISSING -> Agent 5 (default) or Agent 3 if section-level generation root cause
- INTERNAL_META_LEAK_IN_PUBLISH -> Sam (Final Cleanup)
- PLACEHOLDER_ARTIFACT_GATE -> Sam (Final Cleanup)

Hard rule:
- Sam may route, validate, merge, and insert.
- Sam must not do content-authoring rescue for Writer/Outline failures.

## G) Admin Dashboard Insertion Map (Mandatory)
- Content insertion target:
  - collection: resources/blog
  - record: video-zu-text-youtube-blog
  - field: content_markdown
  - input: FINAL.md
- Metadata fields:
  - title: Video-to-Blog Workflow: Turn YouTube Videos into Search-Intent Articles That Rank
  - slug: video-zu-text-youtube-blog
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
- [x] Full run possible using only this brief
- [x] No context loss
- [x] Deterministic insertion points defined
- [x] Gates + routing binding
- [x] Sam orchestration-only
