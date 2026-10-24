# Auto-Merger Configuration

## Repository Copy vs Live Copy

**Repository:** `scripts/auto-merger.sh` (version controlled)  
**Live Location:** `/Users/ofir/ke-goals/auto-merger.sh` (actively running)  
**LaunchAgent:** `/Users/ofir/Library/LaunchAgents/com.kenyonexpress.auto-merger.plist`

### Why Two Copies?

The auto-merger script must live outside the repository it operates on to avoid:
1. Circular dependencies (script modifying itself during merge)
2. Merge conflicts in the script file
3. LaunchAgent path stability (plist references absolute path)

### Keeping Them in Sync

When modifying the auto-merger configuration:

1. **Edit the live copy:** `/Users/ofir/ke-goals/auto-merger.sh`
2. **Copy to repo:** `cp /Users/ofir/ke-goals/auto-merger.sh scripts/auto-merger.sh`
3. **Commit both:** Changes to repo copy + documentation
4. **Verify:** Run `node scripts/test-auto-merger-behavioral.mjs`

### Deploying Script Changes

To deploy a modified script from the repo to the live location:

```bash
# Verify current config
node scripts/test-auto-merger-config.mjs

# Copy repo version to live location
cp scripts/auto-merger.sh /Users/ofir/ke-goals/auto-merger.sh

# Verify behavioral outcomes
node scripts/test-auto-merger-behavioral.mjs
```

**Note:** The auto-merger runs every 5 minutes via LaunchAgent. Changes take effect on the next cycle.

## Current Configuration (C50)

**Source Branch:** `closeout/v1-final`  
**Target Branch:** `main`  
**Strategy:** `--no-ff -X theirs` (always favor source branch on conflicts)  
**Interval:** 300 seconds (5 minutes)  
**Merge Repo:** `/Users/ofir/ke-merger` (dedicated worktree)

## Test Suite

### Configuration Test (Static)
```bash
node scripts/test-auto-merger-config.mjs
```

Verifies the script file contains correct branch names and merge strategy.

### Behavioral Test (Runtime)
```bash
node scripts/test-auto-merger-behavioral.mjs
```

Verifies actual merge outcomes:
- Latest merge is from closeout/v1-final
- C50 changes propagated to main
- No recent autopilot merges
- Merge happened within last hour

## LaunchAgent Management

**Status:**
```bash
launchctl list | grep auto-merger
```

**Restart:**
```bash
launchctl unload ~/Library/LaunchAgents/com.kenyonexpress.auto-merger.plist
launchctl load ~/Library/LaunchAgents/com.kenyonexpress.auto-merger.plist
```

**Logs:**
```bash
tail -f /Users/ofir/ke-goals/auto-merger.log
```

## Related Documentation

- `docs/C50-AUTO-MERGER-CLOSEOUT.md` - C50 changes and rationale
- `docs/BRANCH-AUDIT.md` - Branch divergence analysis
- `CLAUDE.md` - Documented branching strategy
