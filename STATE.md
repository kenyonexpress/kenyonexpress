# KenyonExpress State

## Current Phase
Architecture verification: Checkout + Cardcom vs `feat/checkout-cardcom`.

## Last Completed
Wrote binding verification doc (docs only):

```
docs/ARCHITECTURE-CHECKOUT-CARDCOM-VERIFICATION.md
```

Grounded against worktree

```
/Users/ofir/kenyonexpress-web/ke-checkout
```

branch

```
feat/checkout-cardcom
```

Covers: full Guest→שלם→Google→details/token→Cardcom→coupon 100% platform (no Escrow)→voucher+QR→notifications; physical split via snapshotted `platform_percent`; gap list; Escrow/5%/C11-(ב) deletion inventory; migration order through 070 + proposed 071.

## In Progress
nothing

## Blocking Issues
none

## Next Task
Commit on

```
arch/checkout-cardcom-verification
```

after explicit approval. Then (separate task, not this doc): delete escrow runtime path in `ke-checkout` before prod Cardcom money.

## Working Directory
/Users/ofir/kenyonexpress-web/ke-arch-checkout-verify

Main app:

```
/Users/ofir/kenyonexpress-web/kenyonexpress
```

## Supabase Project URL
not set in this worktree

---
## History

### 2026-07-31: Checkout Cardcom verification architecture
- Added `docs/ARCHITECTURE-CHECKOUT-CARDCOM-VERIFICATION.md`
- Docs only; no `src/` changes
