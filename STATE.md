# KenyonExpress State

## Current Phase
Architecture docs: Notifications V2 (`arch/notifications-v2` worktree).

## Last Completed
Wrote binding architecture doc (docs only):

```
docs/ARCHITECTURE-NOTIFICATIONS-V2.md
```

Final stack: Resend + Supabase Trigger + Edge Function (no Make/Zapier). Events: coupon purchase (email+WhatsApp+QR to customer, supplier alert), redeem confirmations, 48h expiry reminder, physical supplier ship alert. RTL Hebrew templates, retry+DLQ, unsubscribe/consent.

Worktree:

```
/Users/ofir/kenyonexpress-web/ke-arch-notifications-v2
```

Branch:

```
arch/notifications-v2
```

## In Progress
nothing

## Blocking Issues
none

## Next Task
Commit on

```
arch/notifications-v2
```

after explicit approval. Do not wire Make/Zapier. Implement Edge worker when asked on an app branch.

## Working Directory
/Users/ofir/kenyonexpress-web/ke-arch-notifications-v2

Main app:

```
/Users/ofir/kenyonexpress-web/kenyonexpress
```

## Supabase Project URL
not set in this worktree

---
## History

### 2026-07-31: Notifications V2 architecture
- Added `docs/ARCHITECTURE-NOTIFICATIONS-V2.md`
- Docs only; no `src/` changes
