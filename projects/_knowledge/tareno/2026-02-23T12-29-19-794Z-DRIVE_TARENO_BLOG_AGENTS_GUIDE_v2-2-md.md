# TARENO_BLOG_AGENTS_GUIDE_v2.2.md

Quelle: Google Drive (Tareno Blogs)
File ID: 1TOxKsODc5l95VBTlMgBKu30SZA_TmYYe
MIME-Type: text/markdown

---

# Tareno Blog Agent System - Guide v2.2 (GEO Optimized)

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
**Purpose:** Create structured, LLM-citeable outlines.

**MANDATORY BLOCKS** (Agent 3 cannot start without these):
1. **Quick Definition** (2 sentences, neutral, fact-based)
2. **Named Framework / Model** (explicit name + description)
3. **When to Use / When Not to Use** (decision framework)
4. **Comparison Element** (Table OR Checklist)
5. **FAQ** (min. 5 questions)
6. **Step-by-Step/Workflow**

**Additional:**
- H1-H4 structure in English
- `section_word_targets` plan

**HARD RULE:** ❌ Agent 3 cannot start if any block missing

---

## Agent 3: The Storyteller (Writer) - Factual First
**Purpose:** Write engaging long-form content.

**CRITICAL RULE - First 300 Words:**
- **Factual**, **skimmable**, **non-narrative**
- NO storytelling in first 300 words
- Storytelling starts ONLY AFTER:
  - Quick Definition delivered
  - Framework introduced

**Section Requirements:**
- 600+ words per H2
- End EACH section with 1-2 **Takeaway Bullets**
- Total: 2000+ words (Cluster) / 3500+ words (Pillar)

**Constraints:**
- 100% English
- NO product pitches (informational sections)
- NO meta-commentary
- NO fluff

---

## Agent 4: The Solutionist (Integration)
**Purpose:** Native Tareno feature integration.

**Tasks:**
- Identify problem-solution fit
- Add "Deep Dive" sections
- Screenshot placeholders
- Helpful (not salesy) explanations

---

## Agent 5: The Gatekeeper (Validation) - E-E-A-T
**Purpose:** Hard validation with claim verification.

**Claim Classification (MANDATORY):**
Every strong statement gets ONE label:
- `[SOURCE]` → External source (link required)
- `[INTERNAL DATA]` → Own data (marked)
- `[EXPERIENCE]` → Experience/example
- `[OPINION]` → Opinion (use sparingly!)

**Checks:**
- ✅ Word count > 2000/3500
- ✅ All required blocks present
- ✅ When to Use / When Not to Use exists
- ✅ Author bio with credentials
- ✅ Internal links added
- ✅ 100% English
- ✅ **Claim labels applied**
- ✅ **Min. 2 external references**
- ✅ **No unsourced statistics**

**FAIL:** Return to Agent 3

---

## Agent 6: Entity & Linkability Architect (FOCUSED)
**Purpose:** Make content "must-link" reference.

**ONLY 3 Tasks** (NO rewriting, NO new content):

1. **Reference Block erzeugen**
   - "Key Takeaways" (bullet summary)
   - "Summary for AI / Editors" (neutral, quotable)

2. **Frameworks & Tabellen benennen**
   - NO anonymous "Framework"
   - ALWAYS: Name + Purpose

3. **Explizit zitierbare Passage**
   - 2-3 Sätze, neutral, ohne Werbung
   - Blockquote format

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
- Agent 6 focuses only, doesn't expand

---

**Version:** 2.2 | **Last Updated:** 2026-02-18 | **Focus:** GEO Optimization
