# Runbook: Twilio down

This project does **not** require Twilio for v7. Click-to-chat is a wa.me link. Campaigns via Twilio are post-launch (W30). Meta still owns WhatsApp template approval.

If a future Twilio adapter is live:

1. Transactional mail still Resend (independent leg).
2. Kill WhatsApp adapter only (`KILL_SWITCH_NOTIFICATIONS` also kills email: too coarse). Prefer adapter-level skip.
3. Do not fail checkout because WhatsApp 502.

If Twilio was never wired: this runbook is "no action; float links still work if the number env is set".

---

## Second pass

v7 does not require Twilio. Click-to-chat is wa.me. Do not fail checkout on WhatsApp 502. Kill switch notifications also kills email (too coarse).
