# C50: Actual Branching Strategy (2026-10-24)

## Summary

The actual branching strategy differs from what CLAUDE.md documents. This records the measured reality.

## CLAUDE.md States

> `closeout/v1-final` is the work branch. All new work is written on it.
> 
> `main` tracks it after validation, not before.

## Measured Reality (2026-10-24)

### Active Branches

| Branch | Role | Auto-Synced |
|--------|------|-------------|
| `autopilot` | **Active work branch** (current worktree) | → main |
| `main` | Integration target | Receives from autopilot |
| `closeout/v1-final` | Diverged branch | No |

### Auto-Merger Configuration

**File:** `/Users/ofir/Library/LaunchAgents/com.kenyonexpress.auto-merger.plist`  
**Script:** `/Users/ofir/ke-goals/auto-merger.sh`  
**Interval:** Every 300 seconds (5 minutes)  
**Repository:** `/Users/ofir/ke-merger` (dedicated merge worktree)

**Flow:**
```
autopilot → [auto-merger -X theirs] → main
```

The auto-merger:
1. Fetches `origin/autopilot` and `origin/main`
2. Checks out main and resets to `origin/main`
3. Merges `origin/autopilot` with `--no-ff -X theirs`
4. If conflicts exist, force-resolves ALL with `git checkout --theirs`
5. Pushes to `origin/main`

**Conflict Resolution:** Always favors `autopilot` (theirs) over `main` (ours)

### Branch Divergence

**Measured:** `git rev-list --left-right --count origin/closeout/v1-final...origin/autopilot`

```
410 404
```

- `closeout/v1-final` has 410 unique commits
- `autopilot` has 404 unique commits
- **Total divergence:** 814 commits
- **Status:** Completely independent branches

### Current Work Location

**STATE.md confirms:**
```
Branch: autopilot
Working directory: /Users/ofir/kenyonexpress-autopilot (worktree)
```

All C33-C49 work documented in STATE.md was completed on `autopilot`, not `closeout/v1-final`.

### Auto-Merger Activity (Last 24 Hours)

**Sample from** `/Users/ofir/ke-goals/auto-merger.log`:

```
Sat Oct 24 12:10:xx +07 2026: merging 3 commits from autopilot into main
Sat Oct 24 12:10:xx +07 2026: merge succeeded
Sat Oct 24 12:10:xx +07 2026: pushed
```

**Merge commits on main today:** 20+ auto-merge commits  
**Pattern:** `[auto-merger] merge autopilot (N commits, YYYY-MM-DDTHH:MM)`

## Conclusion

**The work branch is `autopilot`, not `closeout/v1-final`.**

CLAUDE.md's statement about `closeout/v1-final` being the work branch is **outdated**. The actual pattern is:

1. Work happens on `autopilot` (worktree at `/Users/ofir/kenyonexpress-autopilot`)
2. Auto-merger syncs `autopilot` → `main` every 5 minutes using `-X theirs`
3. `closeout/v1-final` is a diverged branch with separate history
4. Direct work on `main` does not happen (auto-merger overwrites it)

**Recommendation:** Update CLAUDE.md to reflect actual practice, or reconcile the branches if `closeout/v1-final` should be the canonical work branch.

---

**Measured:** 2026-10-24 15:46 +07  
**Source:** LaunchAgent logs, git rev-list, auto-merger.sh inspection
