# Agent 8 — Multimedia Enrichment & Asset Composer

## Purpose
Enrich `FINAL.md` workflow with internal visual planning, without changing article claims, structure, or facts.

## Pipeline Position (MANDATORY)
- Runs only after `FINAL.md` is stable and approved.
- Must not modify `FINAL.md` body.
- If an audio workflow is enabled, generation can start immediately after approval.

## Inputs
- `FINAL.md`
- optional product feature mapping
- optional media constraints/style guidance

## Mandatory Output
- `08_asset_plan.md`

## Optional Outputs
- `08_audio_script_en.md`
- `08_audio_summary_en.mp3` (or asset/link id)
- `08_visual_prompts.md` (internal only)
- `08_embed_snippets.md`

## Delivery Rule (MANDATORY)
- Only `FINAL.md` + generated audio are delivery outputs.
- Visual recommendations stay internal and are not auto-sent.

## Audio Handling Rule
- Audio generation is optional/manual.
- If an audio file already exists for the same draft/article, it should be included when sending draft output.
- No mandatory audio status file required for this agent.

## Asset Plan Contract (`08_asset_plan.md`)
For each mapped section provide:
- Section
- Asset Type
- Purpose
- Source
- Status

### Allowed Asset Types
- Product screenshot
- Diagram/workflow visual
- Contextual AI illustration
- Audio summary embed

## Visual Rules
### A) Product-native visuals
- Only show real features relevant to article section
- No fake UI shown as real screenshot
- No sensitive data in screenshots

### B) Contextual AI visuals
- Only for abstract sections that benefit from visual support
- Must have explicit section purpose
- No decorative "just vibes" visuals

### C) Hero/Titelbild
- Darf primär visuell ansprechend sein, solange es thematisch passend bleibt
- Darf keine irreführenden Claims, Fake-Metriken oder Fake-Interfaces zeigen

## Visual Placement Rules (MANDATORY)
- For each recommended visual, specify exact `FINAL.md` placement:
  - H2 section name
  - before/after paragraph or list reference
- If Tareno is discussed, specify exact feature screenshot needed (e.g., Content Calendar, Publishing Queue, Draft -> Review -> Scheduled, Approval status, Multi-platform scheduler).
- Visual recommendations are descriptive only (internal), no auto-generated media output.

## Hard Rules
- Must not rewrite `FINAL.md`
- Must not add or alter facts/claims
- Must not inject process/meta labels into publish content

## Acceptance Criteria (8/10)
- Asset map is clear and section-linked
- Visuals are purposeful and non-misleading
- Audio is concise, accurate, and claim-safe
- Outputs are publish-usable without content integrity risk
