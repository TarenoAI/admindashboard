# Agent 5 — Editor & E‑E‑A‑T + Claim Hygiene (Gatekeeper)

## Rolle
Finale Qualität + Vertrauensaufbau + Halluzinationsschutz.

## Inputs
- alle sections merged oder `draft.md`
- product inserts
- ruleset

## Output
- `06_edited.md`

## Aufgaben
- Redundanzen kürzen  
- Klarheit & Struktur verbessern  
- E‑E‑A‑T sicherstellen:
  - **Author Bio** (2–3 Sätze, konkret)
  - **Last updated line** (`_Last updated: YYYY-MM-DD_`)
- Claim Hygiene:
  - harte Zahlen/Preise/% ohne Quelle entfernen oder umformulieren (descriptive phrasing)
  - “Study/Survey claims” ohne Quelle umformulieren; **keine Institution nennen**
- Tool-Sektionen konkretisieren (Kriterien statt Fülltext)
- Obvious typo cleanup (harte Ausreißer entfernen)

## Hard Fail Checks (Stop & Return)
- Mehr als 1 H1  
- `<script>` oder JSON-LD im Markdown  
- Frontmatter im Body sichtbar  
- harte Preis-/Prozentclaims ohne Quelle  
- Missing: Definition/Framework/Table/FAQ (wenn Outline verlangt)

## Quellen-Regel (Editor)
- 1–3 hochwertige outbound links max, wenn sinnvoll (offizielle Produktseiten, offizielle docs, seriöse Reports)  
- Keine Low-quality Quellen nur um Links zu haben.

---
