# Code Debt Status

## Scan Results (2026-10-27 MAINTENANCE_LOOP_8)

**Date:** 2026-10-27 18:58 UTC+7 (fresh scan)
**Scanned:** src/ (all .ts, .tsx, .js, .jsx files)

### Summary
- TODO comments: 6
- FIXME comments: 0
- HACK comments: 0
- **Total items: 6**
- **Delta:** 0 (stable from 2026-10-27 08:56 scan)

### Status
No code debt growth. All items are tracked in docs/BACKLOG.md.
See BACKLOG.md for details on blocked items (Cardcom credentials, R2 credentials).

### Breakdown
- **src/lib/images/r2-migration.ts:** 4 TODOs (R2 migration workflow)
  - Line 103: Query database for all product images
  - Line 104: Batch upload to R2
  - Line 105: Update product.images URLs to point to R2
  - Line 106: Verify uploads and delete from source
- **src/lib/payments/cardcom.ts:** 2 TODOs (legacy API confirmation)
  - Line 249: Confirm exact legacy refund endpoint + field names
  - Line 312: Confirm endpoint + field names against live terminal
- **FIXME/HACK:** 0

### Previous Scans
- 2026-10-27 08:56: Total 6 items, delta +0
- 2026-10-26 06:50: Total 6 items, delta +0
- 2026-10-25: Total 7 items, delta -1 (from 8)

### Action
No cleanup goal queued (debt level stable, items blocked by external dependencies).
