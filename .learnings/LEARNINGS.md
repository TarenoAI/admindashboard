## [LRN-20260403-001] best_practice

**Logged**: 2026-04-03T13:39:57Z
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
For OpenClaw Telegram incidents, validate bindings and live model/tool schema before assuming the named chat persona is the executing agent.

### Details
The visible chat persona `tarenoblog` can mask the fact that Telegram is actually bound to `main` in the active profile. When tools appear missing after a gateway crash or model-auth issue, the most reliable path is:
1. confirm bindings,
2. confirm live model/provider,
3. restart the gateway,
4. test in a fresh DM session,
5. only then patch individual agent definitions.

### Suggested Action
Use `config get bindings`, `models status`, and gateway logs as the first-line checklist for future OpenClaw Telegram tool failures.

### Metadata
- Source: error
- Related Files: config/openclaw-tareno.json
- Tags: openclaw, telegram, tools, bindings, runtime
- Pattern-Key: harden.openclaw.telegram_binding_diagnosis

---
