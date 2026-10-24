# M-Cycle: 2-Hour Maintenance Monitoring System

**Version:** 1.0.0  
**Date:** 2026-10-24  
**Purpose:** Continuous health monitoring via automated 2-hour maintenance cycles

## Overview

The M-Cycle system runs 18 critical maintenance tasks (M01-M18) every 2 hours in a continuous loop. It runs in tmux session `ke-final` for reliability and provides detailed status reports.

## Task Definitions: M01-M18

| ID | Task | Type | Critical | Timeout | Description |
|----|------|------|----------|---------|-------------|
| M01 | Type Check | Gate | ✅ Yes | 120s | TypeScript type checking via `pnpm type-check` |
| M02 | Lint Check | Gate | ✅ Yes | 120s | Code linting via `pnpm lint` |
| M03 | Build Test | Gate | ✅ Yes | 300s | Production build via `pnpm build` |
| M04 | E2E Health | Monitor | ❌ No | 10s | E2E test results parsing |
| M05 | DB Performance | Monitor | ❌ No | 30s | Database connection pool and query performance |
| M06 | Lighthouse Smoke | Monitor | ❌ No | 60s | Performance metrics smoke test |
| M07 | Prerender Chunks | Gate | ❌ No | 30s | Static prerendering validation |
| M08 | Code Debt Scan | Audit | ❌ No | 30s | Hardcoded values audit |
| M09 | Deps Status | Monitor | ❌ No | 30s | Dependency update check via `pnpm outdated` |
| M10 | Cron Status | Monitor | ❌ No | 15s | Cron job drift detection |
| M11 | Gate Status | Monitor | ❌ No | 30s | Visual parity gate status |
| M12 | Secret Audit | Audit | ✅ Yes | 20s | Secret exposure and rotation check |
| M13 | Money Constraints | Audit | ✅ Yes | 15s | Financial integrity constraints |
| M14 | Role Separation | Audit | ❌ No | 15s | RBAC and permission separation |
| M15 | Canonical Host | Monitor | ❌ No | 15s | Canonical URL and DNS configuration |
| M16 | Deployed Build | Monitor | ❌ No | 20s | Production deployment verification |
| M17 | Default Branch | Monitor | ❌ No | 10s | Git default branch configuration |
| M18 | Backup Health | Monitor | ❌ No | 15s | Backup system health check |

**Critical tasks** (M01, M02, M03, M12, M13): Failure of these tasks indicates serious issues requiring immediate attention. The M-cycle continues running but sends notifications.

**Non-critical tasks**: Failures are logged but do not trigger alerts. They indicate areas needing attention but not blocking issues.

## Usage

### Start M-Cycle

```bash
# Start in detached tmux session
./scripts/start-m-cycle-tmux.sh

# Start and attach to watch live
./scripts/start-m-cycle-tmux.sh --attach
```

### Monitor Status

```bash
# View latest status report
cat docs/M-CYCLE-STATUS.md

# View last 20 lines of tmux session
tmux capture-pane -t ke-final -p | tail -20

# Attach to tmux session
tmux attach -t ke-final
# (Detach with: Ctrl+b, then d)
```

### Stop M-Cycle

```bash
# Graceful stop (checked every minute during sleep)
touch /tmp/m-cycle.stop

# Verify stopped
tmux capture-pane -t ke-final -p | tail -10
```

### Run Single Task

```bash
# Test specific task
node scripts/m-cycle.mjs --task=M05

# Dry run (no actual execution)
node scripts/m-cycle.mjs --dry-run
```

## Reports

### Status Report Location

`docs/M-CYCLE-STATUS.md`

Updated after each cycle with:
- Timestamp of last run
- Pass/fail summary
- Detailed task results
- Failed task diagnostics
- Next cycle estimate

### Notifications

Critical failures trigger ntfy.sh notifications:
```
Endpoint: https://ntfy.sh/kenyon-ofir-limit
Message: "M-Cycle #N: Critical failures detected"
```

## Architecture

### File Structure

```
scripts/
  m-cycle.mjs              # Main M-cycle task runner
  run-m-cycle-loop.sh      # 2-hour continuous loop wrapper
  start-m-cycle-tmux.sh    # Tmux session manager
  
docs/
  M-CYCLE.md               # This documentation
  M-CYCLE-STATUS.md        # Latest cycle results (auto-generated)
```

### Execution Flow

```
start-m-cycle-tmux.sh
  └─ Creates/attaches tmux session "ke-final"
     └─ run-m-cycle-loop.sh (continuous)
        ├─ Run: node scripts/m-cycle.mjs
        ├─ Write: docs/M-CYCLE-STATUS.md
        ├─ Notify: On critical failures
        └─ Sleep: 2 hours (check stop flag every minute)
```

### Exit Codes

**m-cycle.mjs:**
- `0` - All tasks passed
- `1` - One or more tasks failed (including critical)
- `2` - Script error (loop stops)

**run-m-cycle-loop.sh:**
- `0` - Graceful stop via stop flag
- `2` - Script error from m-cycle.mjs

## Integration

### With ETERNAL-OPS System

The M-cycle complements the existing eternal operations system documented in `docs/ETERNAL-OPS.md`:

- **Spawner independence**: M-cycle runs in its own tmux session (`ke-final`), separate from the main autopilot spawner (`kenyon-loop.sh`)
- **No conflict**: M-cycle does not modify code or run commits, only monitors health
- **Shared ntfy**: Uses same notification channel as the main loop

### With Existing Maintenance Loops

References to `MAINTENANCE_LOOP_1` through `MAINTENANCE_LOOP_9` in existing docs refer to ad-hoc maintenance runs. The M-cycle system standardizes and automates these as recurring tasks.

## Maintenance

### Adding New Tasks

Edit `scripts/m-cycle.mjs` and add to the `TASKS` object:

```javascript
M19: {
  name: 'New Task Name',
  cmd: 'command-to-run',          // Direct command
  // OR
  script: 'script-name.mjs',      // Script in scripts/ directory
  timeout: 30000,                 // Milliseconds
  critical: false,                // true for blocking issues
  expectFail: false,              // true if non-zero exit is normal
},
```

### Updating Task Timeouts

If tasks consistently timeout, increase the `timeout` value in milliseconds. Current timeouts are conservative estimates.

### Disabling Tasks Temporarily

Filter to specific tasks:
```bash
node scripts/m-cycle.mjs --task=M01
```

Or comment out tasks in the `TASKS` object.

## Troubleshooting

### M-Cycle Not Running

```bash
# Check if session exists
tmux has-session -t ke-final 2>/dev/null && echo "Session exists" || echo "Session missing"

# Check what's in the session
tmux capture-pane -t ke-final -p | tail -30

# Restart
./scripts/start-m-cycle-tmux.sh
```

### Critical Failures Not Notifying

```bash
# Test notification manually
curl -d "Test M-Cycle notification" https://ntfy.sh/kenyon-ofir-limit

# Check if curl is available
command -v curl
```

### Stop Flag Not Working

```bash
# Verify stop flag location
ls -la /tmp/m-cycle.stop

# Check if loop is checking for it
tmux capture-pane -t ke-final -p | grep -i "stop flag"

# Force kill (last resort)
tmux kill-session -t ke-final
```

### High Resource Usage

M-cycle runs full builds and type checks. If resource usage is problematic:

1. Increase cycle interval in `run-m-cycle-loop.sh`
2. Disable heavy tasks (M03 build) during business hours
3. Run on lower priority: `nice -n 10 ./scripts/run-m-cycle-loop.sh`

## History

**2026-10-24 (C46):** Initial M-cycle system created with M01-M18 task definitions. Integrated with tmux ke-final session for autonomous 2-hour health monitoring.

## Related Documentation

- `docs/ETERNAL-OPS.md` - Main autopilot spawner system
- `docs/E2E-STATUS.md` - E2E test results (M04 monitors this)
- `docs/DB-STATUS.md` - Database health (M05 writes this)
- `docs/CODE-DEBT-STATUS.md` - Code debt audit (M08 writes this)
- `docs/CRON-STATUS.md` - Cron monitoring (M10 reads this)
- `docs/LIGHTHOUSE-STATUS.md` - Performance metrics (M06 writes this)
