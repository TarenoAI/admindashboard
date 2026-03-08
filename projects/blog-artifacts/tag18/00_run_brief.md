# 00_run_brief.md

## A) Job Metadata
- TAG: TAG-18
- Title: Instagram SEO in Practice: Why Keywords Usually Outperform Hashtag-Only Strategies
- Slug: instagram-seo-keywords-statt-hashtags
- Language: en
- Focus keyword: instagram seo keywords vs hashtags
- Secondary keywords: instagram search signals, profile name keywords, caption intent matching, hashtag layering
- Cluster/Topic: Organic Discovery & Content Repurposing
- Search intent: Informational + Advanced Implementation
- Audience: creators, social media managers, growth leads, small marketing teams
- Article type: authority
- Word target: 2800 (tolerance 2550-3050)

## B) Mode Lock (Mandatory)
- MODE=CHUNKED_WRITING
- Mode must not change mid-run.

## C) Agent Execution Plan (Mandatory)

### Step 01 — Agent 0a -> 01_kb_pack.md
- Input files: TAG-18 plan row, strategy docs, gate/routing policy
- Scope constraints: compile context + constraints only
- Hard stop conditions: missing keyword scope, missing audience, unclear article promise

### Step 02 — Agent 1 -> 02_research.md
- Input files: 01_kb_pack.md
- Scope constraints: source-backed Instagram SEO research with explicit reliability notes
- Hard stop conditions: weak/unsourced claims, missing anchor terms, no measurable hypotheses

### Step 03 — Agent 2 -> 03_outline.md
- Input files: 01_kb_pack.md, 02_research.md
- Scope constraints: mandatory GEO blocks + authority section plan + topic-anchor map per H2
- Hard stop conditions: missing mandatory blocks, missing source placeholders, abstract outline without Instagram-specific mechanics

### Step 04 — Agent 3 -> 04_sections/section_XX.md
- Input files: 03_outline.md
- Scope constraints: first 300 words factual; authority depth per section; no append retries
- Hard stop conditions: repetition loop, FAQ duplication, topic drift, missing mini-example, missing trade-off/edge-case/decision rule

### Step 05 — Agent 4 -> 05_product_inserts.md
- Input files: 04_sections/*
- Scope constraints: product insert contract only
- Hard stop conditions: insert count/length/term violations

### Step 06 — Agent 5 -> 06_edited.md
- Input files: 04_sections/*, 05_product_inserts.md
- Scope constraints: claim/source checks, volatile claim rewrite, dedupe, final-contract precheck
- Hard stop conditions: unresolved sources, unsourced volatile statements, duplicate blocks, meta leakage in publish body

### Step 07 — Agent 6 -> 07_geo_polish.md
- Input files: 06_edited.md
- Scope constraints: additive GEO patch only; no structural rewrite
- Hard stop conditions: internal meta headings, volatile snippet content, content rescue behavior

### Step 08 — Sam merge -> FINAL.md
- Input files: 06_edited.md, 07_geo_polish.md, 05_product_inserts.md
- Scope constraints: deterministic merge + full gate execution + routing only
- Hard stop conditions: any reject gate fail; Sam must not content-author

### Step 09 — Agent 7 -> 08_asset_plan.md (optional)
- Input files: FINAL.md
- Scope constraints: internal asset mapping only
- Hard stop conditions: decorative-only plan, policy/safety issues

## D) Artifact Contract (Mandatory)
- 01_kb_pack.md: context package + constraints
- 02_research.md: source-backed findings + anchor inventory
- 03_outline.md: mandatory architecture + section targets + anchor map
- 04_sections/*: authority sections with mechanism + mini-example
- 05_product_inserts.md: validated insert blocks
- 06_edited.md: publish-ready edited body
- 07_geo_polish.md: additive GEO patch only
- FINAL.md: single merged final artifact
- 08_asset_plan.md (optional): internal visual/audio map

## E) Integrity Gates (Mandatory)
1. Repetition Gate
- sentence appears >2x OR paragraph appears >1x -> FAIL

2. FAQ Uniqueness Gate
- duplicate/near-duplicate FAQ answers OR missing unique detail -> FAIL

3. Topic Specificity Gate
- each H2 must include >=2 topic anchors + >=1 mini-example -> FAIL

4. Placeholder/Artifact Gate
- unresolved placeholders OR internal process headings in FINAL -> FAIL

5. Final Contract Block Gate
- YAML frontmatter missing required keys (`title`, `slug`, `language`, `status`, `author`, `last_updated`) -> FAIL
- TL;DR (3-5 bullets) missing before Quick Definition -> FAIL
- Key Takeaways (3-6 bullets) missing near end -> FAIL

6. Outline Contract Gate
- missing required blocks/placeholders -> FAIL

7. Product Insert Contract Gate
- rule mismatch -> FAIL

8. Authority Structure Gate
- each core section must include: counterargument + trade-off + edge case + concrete scenario + decision rule

9. Wordcount Target Gate
- authority target 2800 (2550-3050)
- under target -> regenerate with new information layers only (examples, edge cases, trade-offs, decision rules)
- repetition/template padding forbidden

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
- FINAL_CONTRACT_BLOCK_MISSING -> Agent 5 (or Agent 3 if section-generation root cause)
- INTERNAL_META_LEAK_IN_PUBLISH -> Sam (Final Cleanup only)
- PLACEHOLDER_ARTIFACT_GATE -> Sam (Final Cleanup only)

Hard rule:
- Sam routes, validates, merges, inserts.
- Sam does not author/repair content for Writer/Editor failures.

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
- [x] Run can execute end-to-end with only this brief
- [x] No context loss
- [x] Deterministic dashboard insertion points
- [x] Binding gates + routing
- [x] Sam orchestration-only
- [x] Authority wordcount target explicitly enforced
