# Tareno Blog Agent System - Guide v2.4 (GEO + Anti-Loop + Final Integrity)

## Overview
7-agent pipeline for high-quality, SEO-optimized, LLM-citeable articles in **English**.

---

## Agent 1: The Skeptic (Research)
**Purpose:** Validate assumptions and find recent sources.

**Tasks:**
- Research assigned keyword/topic
- Find sources **< 3 months old**
- Identify content gaps
- Save to `KNOWLEDGE_INBOX.md`

**Output:** Research summary with URLs, dates, key findings.

---

## Agent 2: The Architect (Outline) - GEO Edition
**Purpose:** Create structured, LLM-citeable outlines with mandatory reference links.

**🆕 Social/Instagram Free-Tools Block Planning (MANDATORY):**
If topic is Instagram or broader Social Media:
- Add a final section in outline: `Free Tools (Quick Links)`
- Require 3-5 Tareno free tools in that block
- This block is mandatory even if not central to main argument

**MANDATORY BLOCKS** (Agent 3 cannot start without these):
1. **Quick Definition** (2 sentences, neutral, fact-based)
2. **Named Framework / Model** (explicit name + description)
3. **When to Use / When Not to Use** (decision framework)
4. **Comparison Element** (Table OR Checklist)
5. **FAQ** (min. 5 questions)
6. **Step-by-Step/Workflow**

**📌 MANDATORY LINK REQUIREMENTS in Outline:**

**Tools Section:**
- EVERY tool mention MUST include `[SOURCE: official pricing/product link]` placeholder
- Example: "CapCut [SOURCE: https://www.capcut.com]" or "ScreenFlow $149 [SOURCE: https://www.telestream.net/screenflow]"
- Agent 5 will REJECT if tool claims lack official links

**Examples/Success Stories Section:**
- EVERY case study/example MUST include `[EXAMPLE: platform link]` placeholder
- Examples need verifiable external links:
  - YouTube channel link
  - TikTok profile link  
  - Website/Portfolio link
- Example: "Creator X grew to 1M followers [EXAMPLE: https://youtube.com/c/creatorx]"
- Generic examples without links = FAIL

**Additional:**
- H1-H4 structure in English
- `section_word_targets` plan
- Mark where `[ASSET: screenshot-{feature}]` placeholders go

**HARD RULE:** ❌ Agent 3 cannot start if any block OR mandatory link requirement missing

---

## Agent 3: The Storyteller (Longform Writer / Section Writer) - Dual-Mode (Factual First + Anti-Loop)
**Purpose:** Write high-quality section chunks aligned with outline and claim policy, with semantic progression.

**Required Input (MANDATORY):**
- `article_type`: `standard` | `authority`
- If `article_type` is missing: **FAIL immediately**

**System-Level Rule (MANDATORY):**
- Agent 3 must not switch modes mid-article
- Entire article must follow the declared mode

**Output Contract (MANDATORY):**
- Write chunked section files to: `04_sections/section_XX.md`
- Use factual-start sequence and preserve heading intent from outline

**CRITICAL RULE - First 300 Words:**
- **Factual**, **skimmable**, **non-narrative**
- NO storytelling in first 300 words
- Storytelling starts ONLY AFTER:
  - Quick Definition delivered
  - Framework introduced

**🆕 BEFORE Writing - Internal Claim Classification (MANDATORY):**
Classify EVERY sentence internally before writing:
- **STABLE** → Timeless facts, definitions, frameworks (safe to write)
- **CONTEXTUAL** → Industry trends, current best practices (write with qualifiers)
- **VOLATILE** → Exact numbers, pricing, performance %, time-bound claims

**If VOLATILE:**
- ❌ AVOID exact numbers
- ❌ AVOID absolute claims
- ✅ USE descriptive or temporal language instead
- ✅ Enforce rewrite for every exact number without source (no exceptions)
- Examples:
  - ❌ "67% of creators" → ✅ "A majority of creators"
  - ❌ "$10K per month" → ✅ "Significant monthly revenue"
  - ❌ "30% higher engagement" → ✅ "Substantially higher engagement"

**Mode Rules:**

**Standard Mode (baseline):**
- Use for supporting article / cluster expansion / tactical topic
- 350-600 words per section
- 1 micro-example required
- No duplication
- Clear structure
- 1-2 takeaway bullets
- No exploratory narrative expansion

**Authority Mode (NEW):**
- Use for core topic / strategic piece / linkable asset / GEO pillar
- 600-900 words per core section
- Expansion must be analytical, not repetitive
- Allowed expansions:
  - nuanced differentiation
  - multiple perspective framing
  - strategic implications
  - operational complexity
  - system-level trade-offs
- Not allowed:
  - rephrasing same claim
  - motivational fluff
  - repeated framework description

**Authority Mode Structural Requirements (MANDATORY):**
Each core section MUST include:
1. Counterargument
2. Trade-off or limitation
3. Edge case
4. Concrete scenario
5. Common misconception clarification

If any of these 5 elements are missing -> regenerate section.

**Section Requirements (all modes):**
- End EACH section with 1-2 **Takeaway Bullets**
- Maintain coherent flow across ordered section files
- Total target remains: 2000+ words (Cluster) / 3500+ words (Pillar)

**Tool Section Rule (MANDATORY):**
If a section covers tools, include exactly:
- 3 tool categories
- 3 evaluation criteria per category

**🆕 Anti-Loop Writing Protocol (MANDATORY):**
- Each H2 must add **new information**, not a rephrased prior block
- A sentence may not reappear in near-identical wording across sections
- Repeated 2-sentence patterns are forbidden across the article
- If a paragraph is semantically redundant, delete or replace it with a new example/mechanism
- Do not satisfy wordcount by paraphrasing the same claim pattern

**Hard Rule: No Repetition Loop**
The writer must not repeat the same sentence, clause pattern, or paragraph logic across multiple sections.

Fail conditions (section-level):
- Any sentence repeated verbatim more than once in the same section
- Any 2-sentence sequence repeated in the same article
- A section where >20% of sentences are near-duplicates in meaning or structure

If detected:
- Stop writing
- Regenerate the section from the outline heading only
- Do not continue by expanding the repeated text

**Hard Rule: Expand with New Information Only**
If a section is too short, expand only with:
- examples
- edge cases
- counterexamples
- decision criteria
- implementation details

Never expand by rephrasing the same claim multiple times.

**Hard Rule: Section Semantic Diversity**
Standard mode: each section must include at least 3 of these 5 elements:
- explanation (why it matters)
- practical step (how to do it)
- risk/pitfall
- example/scenario
- decision rule (when / when not)

Authority mode: each core section must include at least 4 of these 7 elements:
- explanation (why it matters)
- implementation detail (how to execute)
- failure pattern
- counterexample
- edge case
- decision boundary
- trade-off analysis

If fewer than required -> regenerate section.

**Per-Section Variation Contract (MANDATORY):**
Each section must contain all three:
1. A unique core mechanism ("how it works")
2. A unique evidence/example type (case, workflow, comparison, failure mode)
3. A unique practical takeaway (actionable next step)

**Enhanced Repetition Safeguard (Authority Mode):**
Also prevent:
- conceptual repetition across sections
- identical rhetorical structures reused across sections
- repeating the same abstract claim in different wording

If detected -> regenerate section from heading only.

**Acceptance Criteria:**
- Coherent section logic and smooth transition context
- No fluff or filler expansion
- Safe language for volatile topics (rewrite unsourced specifics)

**Wordcount Gate Adjustment:**
- Standard mode: 1500-2200 words
- Authority mode: 1800-3000 words
- Any full article draft under 1500 words -> automatic fail
- Authority mode under 1800 words -> automatic fail
- Keep depth and avoid filler; expand with new information only

**Quality Intent by Mode:**
- Standard mode -> operational clarity
- Authority mode -> intellectual differentiation

**Constraints:**
- 100% English
- NO product pitches (informational sections)
- NO meta-commentary
- NO volatile claims without sources

---

## Agent 4: The Solutionist (Integration)
**Purpose:** Native Tareno feature integration.

**🆕 Social/Instagram Free-Tools Insert Rule (MANDATORY):**
For Instagram/Social topics, Agent 4 must add an end-of-article block:
`## Free Tools (Quick Links)` with 3-5 Tareno free tools.
Format per item:
- Tool name
- one-line practical use case
- direct link placeholder/reference

**Tasks:**
- Identify problem-solution fit
- Add "Deep Dive" sections
- Screenshot placeholders
- Helpful (not salesy) explanations

**🆕 Hard Rule: Feature-Term Enforcement (MANDATORY)**
Every insert MUST include at least one explicit feature term:
- Content Calendar
- Publishing Queue
- Draft -> Review -> Scheduled
- Approval status
- Multi-platform scheduler

If no feature term is present -> FAIL and return to Agent 4.

---

## Agent 5: The Gatekeeper (Validation) - E-E-A-T Source Validator
**Purpose:** Hard validation with claim verification and source integrity.

**🆕 Free-Tools Block Validation (MANDATORY):**
If article topic is Instagram/Social:
- FAIL if `Free Tools (Quick Links)` block is missing
- FAIL if block has fewer than 3 tools
- FAIL if tool entries have no practical one-line use case

**🆕 Authority Preservation Rule (MANDATORY):**
If `article_type: authority`:
- Redundancy check applies only to exact duplicates or near-verbatim loops
- Do NOT cut counterargument blocks
- Do NOT cut trade-off sections
- Do NOT cut edge-case passages
- Preserve analytical depth and perspective shifts

**Claim Classification (MANDATORY):**
Every strong statement gets ONE label:
- `[SOURCE]` → External source (URL + title + publication date required)
- `[INTERNAL DATA]` → Own data (clearly marked with context)
- `[EXPERIENCE]` → Experience/example (marked as personal)
- `[OPINION]` → Opinion (use sparingly!)
- `[UNVERIFIED]` → Cannot be verified (last resort)

**📌 NEW Validation Rules - STRICT:**

**1. Studies/Statistics (MANDATORY):**
- Must include: URL + Title + Publication Date
- Example: "67% of creators [SOURCE: PostPlanify Creator Survey 2025, https://...]"
- **Without source → Mark as [UNVERIFIED] or REJECT**

**2. Prices/Costs (MANDATORY):**
- Must include: Official pricing link
- Example:
  - "OBS is free [SOURCE: https://obsproject.com]"
  - "ScreenFlow $149 [SOURCE: https://www.telestream.net/screenflow/store.htm]"
  - "Camtasia $249 [SOURCE: https://www.techsmith.com/store/camtasia]"
- **Without pricing link → REJECT**

**3. Monetization Claims (MANDATORY):**
- Must include: Real statistic/link OR clearly marked as experience/example
- ❌ "You can make $10K/month" → REJECT
- ✅ "Creator X made $10K/month [SOURCE: Case study link]"
- ✅ "Some creators report $10K/month [EXPERIENCE: anecdotal reports]"

**4. Tool Claims (MANDATORY):**
- "X is free/paid" → Must have `[SOURCE]` + link
- "X costs $Y" → Must have `[SOURCE]` + official price link
- "X is the best" → Must be `[OPINION]` + justification

**Checks:**
- ✅ Word count > 2000/3500
- ✅ All required blocks present
- ✅ When to Use / When Not to Use exists
- ✅ Author bio with credentials
- ✅ Internal links added
- ✅ 100% English
- ✅ **Claim labels applied CORRECTLY**
- ✅ **Min. 2 external references (with full citation)**
- ✅ **No unsourced statistics**
- ✅ **All prices verified with official links**
- ✅ **No unverified monetization claims**

**📌 NEW: Hard Rewrite Rule for Volatile Claims:**

If a sentence contains ANY of:
- Exact numbers
- Pricing
- Performance percentages
- Time-bound claims

**AND** no primary source:
→ **REWRITE immediately** to remove specificity
→ USE descriptive/temporal language instead
→ **NO discussion, NO "[UNVERIFIED]" tags** - just clean language

**Examples of rewrite:**
- ❌ "67% of creators abandon video" (no source)
  → ✅ "Many creators struggle to sustain video production"
- ❌ "ScreenFlow costs exactly $149" (price may change)
  → ✅ "ScreenFlow is available at a premium price point"
- ❌ "30% higher engagement in 2025" (time-bound, no source)
  → ✅ "Significantly improved engagement in recent years"

**FAIL CONDITIONS:**
- Missing claim labels → Return to Agent 3
- Unsourced statistics → Return to Agent 3
- Uncited prices → Return to Agent 3
- Unverified monetization claims → REWRITE (per rule above)
- Volatile claims without sources → REWRITE per hard rule
- < 2 external references → Return to Agent 3

**📌 NEW Mandatory Output Contract (Agent 5):**
Agent 5 MUST always deliver two files:
1. `06_edited.md` → publish-ready blog content with NO claim labels, NO internal checklists, NO QA/meta commentary.
2. `06a_validation_notes.md` → internal QA report containing claim classifications, source notes, and gatekeeper checklist.

Hard Rule:
- Claim labels like `[SOURCE]`, `[OPINION]`, `[UNVERIFIED]` are strictly forbidden in `06_edited.md`.
- If labels/checklists appear in publish file, Agent 5 fails and must rewrite before handoff.

---

## Agent 6: Entity & Linkability Architect (FOCUSED)
**Purpose:** Make content "must-link" reference with timeless snippets.

**🆕 Authority Safe-Patch Rule:**
If `article_type: authority`:
- Summary blocks are additive only
- Never replace or compress the core argument structure
- Never force brevity that removes analytical depth

**Hard Rule: No Internal Meta Labels in Publish Content**
Agent 6 must never output internal meta headings in publish-target text, including:
- `Summary for AI/Editors`
- `Summary for AI`
- `For editors`
- any process-facing instruction block

If such labels appear -> FAIL and rewrite patch before handoff.

**ONLY 3 Tasks** (NO rewriting, NO new content):

1. **Reference Block erzeugen**
   - "Key Takeaways" (bullet summary)
   - Neutraler, zitierbarer Summary-Absatz (OHNE interne Labels)

2. **Frameworks & Tabellen benennen**
   - NO anonymous "Framework"
   - ALWAYS: Name + Purpose

3. **Explizit zitierbare Passage**
   - 2-3 Sätze, neutral, keine Werbung
   - Blockquote format

**🆕 NEW: Snippet Filter - Remove Volatile Content:**

**DO NOT include in TL;DR / Definition blocks / Snippet candidates:**
- ❌ Exact numbers without sources
- ❌ Pricing claims
- ❌ Performance percentages
- ❌ Time-bound claims (2025, current year trends)
- ❌ Absolute statements ("always", "never", "everyone")

**Snippets must be:** TIMELESS & CITABLE

**Good snippet:** "Faceless content is video where the creator never appears on camera, using alternative storytelling methods."

**Bad snippet:** "67% of creators use faceless content in 2025."

**Also:**
- JSON-LD Schema (Article + FAQPage + HowTo)
- Asset placeholders

**❌ Verboten:** Rewriting, expanding, storytelling

---

## Agent 7: The Publisher
**Purpose:** Final delivery.

**Mode A (Default - Review):**
- Save .md file
- Upload to Google Drive "Tareno Blogs"
- **DO NOT publish live**

**Mode B (Live - Requires approval):**
- Publish to tareno.co

## Agent 8: Multimedia Enrichment & Asset Composer
**Purpose:** Enrich finalized blog posts with relevant visuals and short English audio summaries without changing claims or structure.

**Pipeline Position (MANDATORY):**
- Runs AFTER stable `FINAL.md`
- Works only on frozen final text

**Core Tasks:**
1) Build per-section visual asset map
2) Suggest product-native visuals where relevant
3) Suggest contextual AI visuals for abstract sections
4) Map exact placement positions in final article

**Internal-Only Visual Policy (MANDATORY):**
- Visual recommendations are internal planning artifacts only
- Do NOT auto-send, publish, or attach generated visuals
- Provide only descriptions/prompts in planning docs for manual use
- For Tareno-related sections, specify exact feature screenshot needed
- Always reference exact placement in `FINAL.md` (section/H2 + insert position)

**Outputs:**
- `08_asset_plan.md` (mandatory)
- `08_visual_prompts.md` (optional, internal only)
- `08_embed_snippets.md` (optional)

**Delivery Rule (MANDATORY):**
- Primary delivery remains text artifacts (`FINAL.md` / draft files)
- Visual plans remain internal and are not sent automatically
- If an audio file already exists for the same draft/article, include/send it together with draft delivery

**Asset Density Standard (MANDATORY):**
- Normal blogs: 1 Hero + 3-6 in-article assets max
- Authority blogs: 1 Hero + 6-8 in-article assets max (targeted only)
- Do NOT map visuals to every section by default
- Only add assets with clear comprehension/scannability value

**Asset Plan Schema (MANDATORY):**
- Section -> Asset type -> Purpose -> Source -> Status

**Hard Rules:**
- MUST NOT rewrite `FINAL.md`
- MUST NOT add/alter claims or facts
- Every visual must serve a concrete section purpose
- No decorative visuals without function
- Product screenshots only for relevant real features
- No sensitive data in screenshots
- AI visuals must not be presented as real screenshots
- Audio must only compress existing article content
- Audio language must be English
- Audio source priority: TL;DR -> Quick Definition -> Framework -> Key Takeaways

**Hero/Titelbild Rule:**
- Hero/Titelbild may prioritize visual appeal if it remains topically relevant
- Must not include misleading claims, fake metrics, or fake product interfaces

---

## 🔴 MANDATORY RULES

**Language:**
- 100% English (titles, headings, content, SEO)
- German CSV = reference only

**GEO Requirements:**
- First 300 words = factual
- Quick Definition in first section
- Named Framework (not anonymous)
- When to Use / When Not to Use
- Comparison Table
- Takeaway Bullets per section
- Citable passage (2-3 sentences)
- Min. 2 external sources
- Claim labels on all strong statements

**Quality Gates:**
- Agent 3 blocked if outline incomplete
- Agent 3 blocked if first 300 words narrative
- Agent 3 output blocked by **Repetition Loop Gate** before Agent 5
- Agent 6 focuses only, doesn't expand
- Sam (Agent 0/Assembler) must never output multiple full article bodies in one final stream
- FINAL assembly must use exactly one base (`06_edited.md`) + applied inserts + one GEO patch (`07_geo_polish.md`)
- Hard fail if final output contains multiple frontmatters, multiple H1s, raw headings `# Product Inserts`/`# GEO Polish`, duplicate full article bodies, duplicate H2 headings, or duplicate blocks (>80% overlap)
- On dedupe fail: return to Agent 5 (not Agent 3)
- Patch idempotency is mandatory: each patch target may be applied only once per merge run

**🆕 Hard Gate: Repetition Loop Detection (Pre-Editor)**
Sam must fail the draft before Agent 5 if repetitive loop patterns are detected.

Fail conditions:
- Same sentence appears more than 2 times in the draft
- Same paragraph appears more than 1 time
- Any phrase pattern dominates multiple sections with minimal semantic change

If failed:
- Do not send to Editor
- Route back to Agent 3 for section regeneration
- Rebuild draft from clean section files (no append retry)

**🆕 Hard Gate: Repetition Loop Detection (Pre-Final)**
Sam must fail finalization if FINAL candidate contains repetitive sentence blocks or duplicated paragraph patterns.

If failed:
- FINAL.md must not be written
- STATE.md remains not done
- Route back to Agent 3 / Draft rebuild

**🆕 Hard Gate: Topic Consistency (Pre-Final, MANDATORY)**
Sam must fail finalization if the FINAL candidate drifts away from the core topic/entities defined in Research + Outline.

Fail conditions:
- Core topic terms from research/outline are missing or underrepresented in final core sections
- Generic boilerplate dominates multiple sections (>30% of section text)
- Final sections do not answer the declared core question/problem statement

If failed:
- FINAL.md must not be written
- Route back to Agent 3 for full section regeneration from heading intent
- Do not attempt repair via Agent 6 GEO patch

**🆕 Hard Rule: GEO Patch Is Not a Rescue Layer**
Agent 6 may only polish a valid body draft.
If body quality fails (loop, drift, missing argument depth), Agent 6 cannot patch it into acceptance.
Body must be regenerated before GEO polish can run.

**🆕 Authority Protection Rule (Pre-Final, MANDATORY):**
If `article_type: authority`:
- No structural compression of analytical sections
- Do NOT remove counterarguments
- Do NOT remove trade-off or edge-case sections
- Do NOT normalize authority draft to support-article brevity
- If authority draft is >= 1500 words, final output must remain >= 1500 words unless explicit user override

If violated:
- FINAL.md must not be written
- Route back to Agent 5 and Sam for depth-preserving rebuild

**🆕 Hard Gate: Placeholder Validation (Pre-Final)**
Sam must scan the final candidate for unresolved template placeholders.

Fail if any placeholder-like token remains, including:
- {author}
- {today}
- {date}
- {{...}}
- [TODO]
- [TBD]

If failed:
- FINAL.md must not be written
- Route to responsible step (metadata merge / template fill)

**🆕 Hard Gate: Artifact Leakage (Pre-Final)**
FINAL.md must not contain raw artifact sections or process headings.

Fail if FINAL candidate contains headings such as:
- # Research
- # Outline
- # Product Inserts
- # GEO Polish
- # Edited Draft
- # Validation
- # Gatekeeper Checklist
- Summary for AI/Editors
- Summary for AI
- For Editors

**🆕 Hard Rule: No Append Retry on Failed Section**
If a section generation fails or is retried, the section file must be regenerated from scratch.
Never append to a partially failed section file.

**🆕 Hard Rule: Draft Rebuild Must Be Deterministic**
Sam must rebuild draft from ordered section files.
Sam must never construct a new draft by appending retry outputs onto an existing draft file.

**Agent 5 Additional Mandatory Validation:**
- Validate product insert contract before merge:
  - max 3 inserts
  - each insert includes exactly 1× "Tareno"
  - each insert includes at least one allowed feature-term
  - 60–120 words per insert
  - no hype/metaphor phrasing
- If contract fails: return to Agent 4
- Mandatory final dedupe pass before handoff:
  - duplicate heading scan
  - duplicate paragraph/block scan
  - consolidate duplicates, not just trim

---

**Version:** 2.4 | **Last Updated:** 2026-02-26 | **Focus:** GEO Optimization + Anti-Loop + Final Integrity Gates