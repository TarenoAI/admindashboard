# PIPELINE_FAILURE_LEDGER

Track every hard-fail before retrying. No retry without a ledger entry.

## Entry Template

- entry_id: FAIL-YYYYMMDD-HHMMSS-<rowId>-<stepId>
- timestamp_utc:
- row_id:
- step_id:
- agent_id:
- attempt_number:
- fail_gate_id:
- fail_reason:
  - 
  - 
- evidence:
  - 
- retry_instructions:
  - 
  - 
- do_not_repeat:
  - 
- required_fixes:
  - 
- status: open
- resolved_at_utc:
- resolved_by:
- resolution_notes:

---

## Open Failures


- entry_id: FAIL-20260308-154339-TAG-17-final
- timestamp_utc: 2026-03-08T15:43:39Z
- row_id: TAG-17
- step_id: final
- agent_id: sam
- attempt_number: 1
- fail_gate_id: FAQ_UNIQUENESS_GATE, TOPIC_SPECIFICITY_GATE, PLACEHOLDER_ARTIFACT_GATE
- fail_reason:
  - FAQ_UNIQUENESS_GATE failed in automated 3-run validation.
  - TOPIC_SPECIFICITY_GATE failed in automated 3-run validation.
  - PLACEHOLDER_ARTIFACT_GATE failed in automated 3-run validation.
- evidence:
  - ## Quick Definition: anchor_count=1, mini_example=False
  - ## Why This Matters Now: anchor_count=3, mini_example=False
  - ## V2B Method: Practical Components: anchor_count=0, mini_example=False
- retry_instructions:
  - Route to responsible agent per gate matrix.
  - Regenerate from heading intent; no append retries.
- do_not_repeat:
  - No boilerplate expansions.
- required_fixes:
  - Add concrete mechanisms and unique details.
- status: open

- entry_id: FAIL-20260308-154339-TAG-18-final
- timestamp_utc: 2026-03-08T15:43:39Z
- row_id: TAG-18
- step_id: final
- agent_id: sam
- attempt_number: 1
- fail_gate_id: FAQ_UNIQUENESS_GATE, TOPIC_SPECIFICITY_GATE, PLACEHOLDER_ARTIFACT_GATE
- fail_reason:
  - FAQ_UNIQUENESS_GATE failed in automated 3-run validation.
  - TOPIC_SPECIFICITY_GATE failed in automated 3-run validation.
  - PLACEHOLDER_ARTIFACT_GATE failed in automated 3-run validation.
- evidence:
  - ## Quick Definition: anchor_count=2, mini_example=False
  - ## Why This Matters Now: anchor_count=3, mini_example=False
  - ## KITE Framework: Practical Components: anchor_count=0, mini_example=False
- retry_instructions:
  - Route to responsible agent per gate matrix.
  - Regenerate from heading intent; no append retries.
- do_not_repeat:
  - No boilerplate expansions.
- required_fixes:
  - Add concrete mechanisms and unique details.
- status: open

- entry_id: FAIL-20260308-154339-TAG-19-final
- timestamp_utc: 2026-03-08T15:43:39Z
- row_id: TAG-19
- step_id: final
- agent_id: sam
- attempt_number: 1
- fail_gate_id: FAQ_UNIQUENESS_GATE, TOPIC_SPECIFICITY_GATE, PLACEHOLDER_ARTIFACT_GATE
- fail_reason:
  - FAQ_UNIQUENESS_GATE failed in automated 3-run validation.
  - TOPIC_SPECIFICITY_GATE failed in automated 3-run validation.
  - PLACEHOLDER_ARTIFACT_GATE failed in automated 3-run validation.
- evidence:
  - ## Quick Definition: anchor_count=1, mini_example=False
  - ## Why This Matters Now: anchor_count=4, mini_example=False
  - ## PIN-AUTO: Practical Components: anchor_count=1, mini_example=False
- retry_instructions:
  - Route to responsible agent per gate matrix.
  - Regenerate from heading intent; no append retries.
- do_not_repeat:
  - No boilerplate expansions.
- required_fixes:
  - Add concrete mechanisms and unique details.
- status: open

<!-- Add newest failures on top -->

## Resolved Failures

<!-- Move resolved entries here with final notes -->
