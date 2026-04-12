## [ERR-20260403-001] openclaw-telegram-tools-stale-session

**Logged**: 2026-04-03T13:39:57Z
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
OpenClaw Telegram blog sessions reported missing `exec`/`write` tools even after the gateway recovered from OOM.

### Error
```text
Tool-System in Session nicht verfügbar:
- "exec-tool not found"
- "write-Aufruf schlägt fehl"
- "sandbox runtime is unavailable for this session"
```

### Context
- VPS `srv828445` hit OOM due to orphaned `chrome-headless` children from `openclaw-gateway-*` systemd user services.
- Root cause of process leak was `KillMode=process`; hardening to `KillMode=control-group` stabilized RAM/CPU/disk.
- After infra recovery, Telegram blog sessions still used a stale or degraded tool schema.
- Historical logs show Telegram sessions on the Tareno profile run through `agent:main`, and `google-antigravity/gemini-3-flash` exposed a full tool schema with `read`, `write`, `exec`, and `sessions_spawn`.
- The local Tareno config binds Telegram `default` to `main`, not `tarenoblog`.
- The deployed OpenClaw build does not support `openclaw auth`; use `models status`, config inspection, gateway restart, and fresh sessions instead.

### Suggested Fix
- Verify the active profile and Telegram bindings before patching a specific agent.
- Prefer restarting the gateway and creating a fresh Telegram DM session after tool-profile changes.
- If Codex auth is degraded, move the live bound Telegram agent to a provider with known full tools, such as `google-antigravity/gemini-3-flash`.

### Metadata
- Reproducible: yes
- Related Files: config/openclaw-tareno.json
- See Also: none

---
