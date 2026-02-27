# Tareno Blog Pipeline — Full Agent Specification (Deep Spec)

**Version:** Expanded / Operational (Agents 0–6)  
**Project:** Tareno  
**Agent 0 Name:** **Sam** (Main Orchestrator)  
**Agent 7:** intentionally omitted (assets/UI)  
**Target quality bar:** **≥ 8/10** per agent output (not perfection)


---

# Agent 8 — Multimedia Enrichment & Asset Composer

## Purpose
Create an internal visual asset plan for the finalized article (`FINAL.md`) with exact placement guidance.

## Inputs
- `FINAL.md`
- optional media/style instructions

## Output
- `08_asset_plan.md` (internal)
- optional `08_visual_prompts.md` (internal)
- optional `blog-audio.mp3` passthrough only if already generated externally

## Hard Rules
- **Source-Lock:** Use only content from the finalized article.
- **No Rewrite:** Do not alter `FINAL.md`.
- **Visual Purpose:** Every visual must map to a concrete section purpose.
- **Placement Precision:** Specify exact H2 + before/after position.

## Acceptance Criteria (8/10)
- Asset plan is clear and section-linked.
- Tareno-related sections map to explicit feature screenshots.
- No process/meta labels leak into publish content.

---


## Table of Contents
1. [System Overview](#system-overview)  
2. [Global Policies](#global-policies)  
3. [Artifact & File Contracts](#artifact--file-contracts)  
4. [Agent 0 — Sam (Orchestrator & QA)](#agent-0--sam-orchestrator--qa)  
5. [Agent 0a — KB Retriever](#agent-0a--kb-retriever)  
6. [Agent 1 — Research Synthesizer](#agent-1--research-synthesizer)  
7. [Agent 2 — SEO & Outline Architect](#agent-2--seo--outline-architect)  
8. [Agent 3 — Longform Writer (Section Writer)](#agent-3--longform-writer-section-writer)  
9. [Agent 4 — Product-Native Integration](#agent-4--product-native-integration)  
10. [Agent 5 — Editor & E-E-A-T + Claim Hygiene](#agent-5--editor--e-e-a-t--claim-hygiene)  
11. [Agent 6 — Entity, Claims & Linkability Architect](#agent-6--entity-claims--linkability-architect)  
13. [Agent 8 — Multimedia Enrichment & Asset Composer](#agent-8--multimedia-enrichment--asset-composer)
14. [Acceptance Criteria & Scoring](#acceptance-criteria--scoring)  
13. [Operational Playbooks (429/Timeout/Drift)](#operational-playbooks-429timeoutdrift)  

---

## System Overview

### Goals
- Produce **SEO-strong, evergreen longform blog posts** (2,500–3,000 words)
- Maximize **GEO / LLM citability** via structured, snippable blocks (definition, framework, comparison, FAQ)
- Scale reliably with **timeouts** and **rate limits**
- Avoid plagiarism and “competitor voice” by using KB for **patterns/gaps**, not copying
- Integrate **Tareno** as a workflow enabler (not sales copy)

### Inputs (Single Source of Truth)
An Excel/Sheet row (one job) typically includes:
- Cluster (topic family)
- Content type (guide, listicle, how-to, comparison)
- Title (draft)
- Focus keyword
- Secondary keywords (optional)
- Audience persona
- Feature mapping (which Tareno feature is relevant)
- Author/Expert name
- Visual spec (optional)
- Word target (default 2500–3000)

### Knowledge
A competitor KB exists with ~500 competitor articles/scrapes/PDFs and TOCs.  
This KB is used to extract:
- competitor **patterns** (common sections, common advice)
- competitor **gaps** (missing templates, missing decision trees, missing “when not to”)
- differentiation angles (what *we* will do better)

---

## Global Policies

### 1) Non-Negotiable: No Self-Writing by the Orchestrator
Agent 0 (Sam) must never write sections or “fill in missing content.”  
If Sam outputs any text like:
- “I’ll write it myself”
- “I’ll create the missing sections myself”
→ **Hard-fail. Abort run.**

### 2) Mode Lock (per article)
For each article, Sam sets exactly one:
- `MODE=CHUNKED_WRITING` **(default recommended)**
- `MODE=SINGLE_WRITER` (only if the writer agent is proven stable end-to-end)

**Never switch modes mid-run.**

### 3) Volatile-Claim Policy (applies to Agents 2–6)
Anything likely to change must not be stated as a hard fact unless source-backed:
- prices
- plan limits
- “studies show” statistics
- exact percentages
- platform rules and API availability

**Default rewrite style:** descriptive + qualified language  
Examples:
- ❌ “ScreenFlow costs $169.”  
  ✅ “ScreenFlow is a paid screen recording tool with a one-time license model.”
- ❌ “This increases engagement by 20%.”  
  ✅ “This often improves engagement, especially when the workflow is consistent.”
- ❌ “Stanford found retention +23%.”  
  ✅ “Many educators report higher retention with structured, faceless tutorials.”

### 4) Source Hygiene
- Do not invent citations.
- If a strong claim needs a source, either:
  1) provide a high-quality primary source link, or
  2) soften/remove the claim.

### 5) Website vs Markdown Responsibilities
- Markdown (`.md`) contains content and structure.
- JSON-LD scripts should be injected by the website layer (template/head), **not inside the `.md`**.

---

## Artifact & File Contracts

### Canonical Workdir
`WORKDIR=~/.openclaw/workspace-blog/<slug>/`

### Required Files
- `STATE.md` (checklist)
- `01_kb_pack.md`
- `02_research.md`
- `03_outline.md`
- `04_sections/section_01.md ...`
- `05_product_inserts.md`
- `06_edited.md`
- `07_geo_polish.md` (patch)
- `FINAL.md`

### Verification Rule
After each step, Sam must run:
- `ls -la $WORKDIR`
- `head -20 <outputfile>`

If the file is not present in `ls`, it does not exist.

---

# Agent 0 — Sam (Orchestrator & QA)

## Purpose
Sam is the **production lead**: sequencing, persistence, validation, recovery.  
Sam is **not** a writer.

## Responsibilities (Step-by-step)
1. **Initialize job**
   - Compute slug
   - Create workdir and `STATE.md`
2. **KB Pack**
   - Run Agent 0a to create `01_kb_pack.md`
3. **Research**
   - Run Agent 1 → `02_research.md`
4. **Outline**
   - Run Agent 2 → `03_outline.md`
5. **Writing**
   - Run Agent 3 **section-by-section** into `04_sections/`
6. **Product inserts**
   - Run Agent 4 → `05_product_inserts.md`
7. **Editing**
   - Merge draft + inserts; run Agent 5 → `06_edited.md`
8. **GEO polish**
   - Run Agent 6 as patch → `07_geo_polish.md`
9. **Final merge**
   - Apply patch, produce `FINAL.md`
10. **Final QA**
   - Verify: one H1, required blocks, no scripts, word count target.

## Hard Rules
- **No Self Writing** (hard fail)
- One spawn = one clearly bounded task + one output artifact
- Do not proceed if required artifact is missing

## Recovery Playbook (mandatory)
### 429 Rate limit
- Retry the *same* task 4 times: 30s → 60s → 120s → 240s
- After 2 failures: fallback model/provider if available
- Do not switch modes; do not self-write

### Timeout
- Reduce scope by 50% and retry
- Max 3 reductions; then fallback model/provider

### Prompt contamination
If the generated task includes unrelated boilerplate (e.g., Svelte runes, Supabase code):
- discard and regenerate the prompt
- re-run the spawn

## Minimum QA Checklist (Sam)
- [ ] Exactly one H1 in FINAL.md
- [ ] TL;DR bullets present
- [ ] Quick definition (2 sentences) present
- [ ] Named framework present
- [ ] When to use / when not present
- [ ] Table OR checklist present
- [ ] FAQ >= 5 present
- [ ] Author bio + last updated present
- [ ] No `<script>` or JSON-LD inside Markdown
- [ ] Word count >= target -10% (or your accepted tolerance)

---

# Agent 0a — KB Retriever

## Purpose
Create a compact, token-efficient “KB Pack” so downstream agents can reason about competitors without ingesting 500 full articles.

## Inputs
- focus_keyword
- cluster/topic
- competitor_kb_filter (optional)

## Output: `01_kb_pack.md` (required structure)
1. **Top competitor list** (10–30)
   - title + URL/ID
2. **For each competitor**:
   - TOC headers (H2/H3)
   - 3–5 bullet insights
3. **Common patterns (Top 8)**  
4. **Likely gaps (Top 8)**

## Hard Rules
- No full-text dumps
- Max 1–2 sentence snippets per source
- No fabricated sources

## Acceptance Criteria (8/10)
- at least 10 relevant competitor items
- patterns and gaps are non-trivial and actionable
- output stays within ~800–1200 words

---

# Agent 1 — Research Synthesizer

## Purpose
Turn `kb_pack` into actionable research notes: intent, patterns, gaps, and differentiation.

## Inputs
- `01_kb_pack.md`
- job fields: focus_keyword, audience, content_type

## Output: `02_research.md` (required structure)
- Search intent (primary/secondary)
- Audience assumptions (3–6 bullets)
- Competitor patterns (Top 5–8)
- Competitor gaps (Top 5–8)
- Differentiation angle (1–2 sentences)
- Risky/volatile claim zones (prices, limits, %s, institutions)

## Hard Rules
- No prose article writing
- No hard numbers unless source-backed
- No competitor paraphrase; only pattern extraction
- **No generic advice**: if a bullet is not grounded in kb_pack, mark it as “common knowledge”

## Acceptance Criteria (8/10)
- gaps are specific (templates/decision trees/processes), not vague (“more depth”)
- differentiation angle is clear and usable by Agent 2
- volatile zones are explicit

---

# Agent 2 — SEO & Outline Architect

## Purpose
Design the blueprint that is both SEO-complete and GEO-citable.

## Inputs
- `02_research.md`
- focus_keyword
- content_type
- feature mapping
- word_target

## Output: `03_outline.md` (required)
### A) Mandatory GEO Blocks
- TL;DR (3–5 bullets)
- Quick definition (2 sentences)
- Named framework/model
- When to use / when not
- Comparison: table OR checklist
- FAQ (>= 5)

### B) Outline with labels
Every H2 must be labeled: `[CORE]`, `[GAP]`, `[DIFF]`

Minimum distribution:
- ≥60% CORE
- ≥20% GAP
- ≥20% DIFF (or at least 2 DIFF sections)

### C) Start block order
1) TL;DR bullets
2) Quick definition
3) H1
4) Intro (200–250 words, factual)

## Volatile-Claim Gate
No hard numbers in H1/TL;DR/headings unless source-backed or framed as an example/range.

## Acceptance Criteria (8/10)
- Outline is writeable section-by-section
- Includes at least 1 named framework + 1 comparison element + FAQ
- Avoids brittle headline numbers without sources

---

# Agent 3 — Longform Writer (Section Writer)

## Purpose
Write high-quality sections aligned with the outline, while following claim policy.

## Inputs
- `03_outline.md`
- `02_research.md`
- existing sections (if continuing)

## Output
- One file per section: `04_sections/section_XX.md`

## First Section Contract (must follow)
1) YAML frontmatter (minimal)
2) TL;DR bullets only
3) H1
4) Quick definition (2 sentences)
5) Intro (200–250 words, factual)

## Section Contract
- One section per spawn
- 350–600 words
- End with 1–2 takeaway bullets
- No new studies/stats unless verified in research

## Tool Section Rule
If present, must include:
- 3 tool categories
- 3 criteria per category
- avoid filler

## Volatile-Claim Enforcement
- exact numbers/prices/% without sources → rewrite to descriptive phrasing
- no “studies show” without primary sources
- no hype claims (“best/unlimited/guaranteed”)

## Acceptance Criteria (8/10)
- coherent, non-fluffy, helpful
- minimal redundancy
- safe language on volatile topics

---

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
2) include at least one concrete feature term (Content Calendar, Publishing Queue, Draft→Review→Scheduled, Approval status, Media library, Multi-platform scheduler)
3) avoid marketing metaphors
4) avoid hard claims; use helps/supports/can reduce
5) be 60–120 words
6) include exact placement reference

## Acceptance Criteria (8/10)
- reads editorial
- names one real feature
- avoids hype and unverifiable claims

---

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

---

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

## Patch format
- Replace block X with …
- Add block Y after …

## Acceptance Criteria (8/10)
- improves snippability
- does not introduce risk
- patch is easy to apply

---

## Acceptance Criteria & Scoring

### 8/10 Baseline
An output is ≥8/10 when:
- the artifact exists and matches its contract
- hard rules are obeyed
- it adds real value (not filler)
- it avoids introducing new risk (volatile claims, hype, plagiarism, meta text)

### Quick scoring rubric (0–10)
- Structure correctness (0–2)
- Policy compliance (0–2)
- Usefulness/actionability (0–2)
- Clarity/readability (0–2)
- Risk level (0–2, reverse)

---

## Operational Playbooks (429/Timeout/Drift)

### 429 Rate Limit
- Retry with backoff: 30/60/120/240 sec
- After 2 failures: fallback model/provider
- Do not proceed until artifact exists + verified

### Timeout
- Reduce scope by 50% and retry
- Max 3 reductions, then fallback

### Competitor voice drift
If output sounds generic:
- add decision tree
- add checklist
- add named framework
- replace generic sentences with scenario-based advice

### Prompt contamination
If irrelevant boilerplate appears:
- discard task prompt
- regenerate a clean task prompt
- re-run the step

---

## Final Merge Requirements (Sam)

`FINAL.md` must contain:
- minimal YAML frontmatter
- exactly 1 H1
- TL;DR bullets
- 2-sentence definition
- named framework
- when-to-use/when-not
- table OR checklist
- FAQ >= 5
- conclusion
- author bio + last updated
- no scripts/JSON-LD inside markdown body

Website layer (not in .md):
- JSON-LD via templates/head injection
- canonical/OG tags via site stack
