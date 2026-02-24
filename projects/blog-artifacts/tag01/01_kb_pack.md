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
