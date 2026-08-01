# KenyonExpress State

## Current Phase
Architecture docs: Account area (`arch/account-area` worktree).

## Last Completed
Wrote binding architecture doc (docs only):

```
docs/ARCHITECTURE-ACCOUNT-AREA.md
```

Covers: `/account` overview, coupons (active/scanned/expired + QR), orders, profile + saved Cardcom tokens, internal cashback wallet (spend at checkout only), logout, Google OAuth only, RTL/Heebo/`#fed700` from `refs/` + `account.css`, full RLS matrix per table, gaps vs live pages, tests.

Worktree:

```
/Users/ofir/kenyonexpress-web/ke-arch-account-area
```

Branch:

```
arch/account-area
```

Supersedes thinner Auth notes in `ke-arch-account` where they conflict (Google-only for account area).

## In Progress
nothing

## Blocking Issues
none

## Next Task
Commit on

```
arch/account-area
```

after explicit approval. Then implement GAP-1 (coupons tabs + QR) on the app branch when asked.

## Working Directory
/Users/ofir/kenyonexpress-web/ke-arch-account-area

Main app:

```
/Users/ofir/kenyonexpress-web/kenyonexpress
```

## Supabase Project URL
not set in this worktree

---
## History

### 2026-07-31: Account area architecture
- Added `docs/ARCHITECTURE-ACCOUNT-AREA.md`
- Docs only; no `src/` changes
