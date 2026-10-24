# C47 Group-Deals Investigation

**Date:** 2026-10-24  
**BACKLOG Item 1:** "Group-deals re-evaluation, 2026-10-23"

## Context

Maintenance loop (MAINTENANCE_LOOP_3) was watching for date 2026-10-23 to queue this item for review. The date has now passed (today is 2026-10-24).

## Investigation

### 1. Codebase Search

**Search for group-deals feature:**
```bash
grep -ri "group" src/ --include="*.ts" --include="*.tsx" | grep -i "deal\|discount\|bulk"
```

**Result:** No group-deals feature found. Only bulk admin operations exist:
- `src/lib/admin/bulk-price.ts` - Admin bulk repricing
- `src/lib/catalogue-cache.ts` - Bulk operations mentioned in comments
- No customer-facing group deals/bulk purchase feature

**Search for group-deals specifications:**
```bash
find docs/ -name "*.md" -exec grep -l "group.*deal\|bulk.*purchase\|volume.*discount" {} \;
```

**Result:** No specification documents found for group-deals feature.

### 2. Git History

```bash
git log --all --grep="group" --oneline
```

**Finding:** Maintenance loops mentioned "group deals about 19 hours out" but only as a date check, not feature work.

### 3. Database Schema

No tables related to:
- Group purchases
- Bulk discounts
- Volume pricing
- Group deal mechanics

### 4. Feature Flags

Checked `src/lib/flags/supabase-flags.ts`:
- physical-products ✓
- courses-monthly
- tzimmer-calendar  
- monthly-billing

**No group-deals flag exists.**

## Conclusion

**No group-deals feature exists to re-evaluate.**

The BACKLOG item "Group-deals re-evaluation, 2026-10-23" appears to be:
1. A placeholder for future consideration, OR
2. A reminder to decide whether to implement group-deals

Without a specification or existing feature, autonomous re-evaluation is impossible.

## Recommendation

**Requires owner decision:**
- Should group-deals feature be implemented?
- If yes, what are the requirements (minimum group size, discount mechanics, time limits)?
- If no, remove from future BACKLOG

## Status

**BLOCKED:** No specification or existing feature to re-evaluate.  
**Action Taken:** Documented investigation. Item moved to BACKLOG-DEFERRED.md.  
**Next Step:** Owner decision required on whether to spec and build group-deals feature.
