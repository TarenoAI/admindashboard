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

<!-- Add newest failures on top -->

## Resolved Failures

<!-- Move resolved entries here with final notes -->
