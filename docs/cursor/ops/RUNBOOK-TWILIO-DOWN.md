# Runbook: Twilio down

This project does **not** require Twilio for v7. Click-to-chat is a wa.me link. Campaigns via Twilio are post-launch (W30). Meta still owns WhatsApp template approval.

If a future Twilio adapter is live:

1. Transactional mail still Resend (independent leg).
2. Kill WhatsApp adapter only (`KILL_SWITCH_NOTIFICATIONS` also kills email: too coarse). Prefer adapter-level skip.
3. Do not fail checkout because WhatsApp 502.

If Twilio was never wired: this runbook is "no action; float links still work if the number env is set".

---

## Second pass

Read with `waves/WAVE-INDEX.md` and `business/LAUNCH-BLOCKERS.md`. Tree on this branch wins over older briefs. Do not apply SQL from this worktree.
