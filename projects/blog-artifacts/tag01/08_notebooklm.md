# Agent 8 — NotebookLM Audio Architect

## Purpose
Convert the finalized blog content (`FINAL.md`) into a high-engagement Audio Overview (Podcast-style) to increase session duration and accessibility.

## Inputs
- `FINAL.md`
- `instructions` (e.g., "Make it sound professional, focus on the GEO frameworks and the Tareno integration benefit")

## Output
- `blog-audio.mp3`
- Embed tag for the website front-end

## Hard Rules
- **Source Integrity:** Only use content from `FINAL.md`. Do not invent new facts.
- **Tone:** Professional, conversational, and energetic.
- **Placement:** Must be referenced in the final publication metadata for the sidebar/hero embed.

## Acceptance Criteria (8/10)
- Audio is clearly audible and matches the article's core message.
- Key entities and the Product (Tareno) are mentioned.
- File is saved in the correct `WORKDIR`.
