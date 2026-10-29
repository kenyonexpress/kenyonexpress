# G100 — Architecture Final: Autopilot Teardown

Date: 2026-10-30. Branch: closeout/v1-final (sole working branch).

## Decision
Retire the separate `autopilot` execution lane. All work continues on `closeout/v1-final` only.

## Design baseline (unchanged)
- Layout: Electro v7 (`refs/electro-home-v7.html`); content source: `refs/ke_live_singlefile.html` (content only, never layout).
- Palette: primary #FDB813, secondary #283A97 (G100 brief); locked tokens in the iron rules remain authoritative for components.
- Locked components untouched by this item.

## Teardown performed
| Step | Result |
|---|---|
| tmux session `ke-autopilot` | killed |
| launchd `com.kenyonexpress.autopilot` | unloaded; plist renamed to `.plist.disabled` |
| worktree `~/kenyonexpress-autopilot` | removed (was clean) |
| local branch `autopilot` | deleted (was 0db4ad4f6) |
| `origin/autopilot` | deleted |

## Recovery
`autopilot` carried 160 commits not present on any other branch or tag. Before deletion a bundle was written to
`~/ke-goals/autopilot-final-0db4ad4f6.bundle` (local only, not committed). Restore with
`git fetch <bundle> autopilot:autopilot`.

## Consequences
- The 2-minute launchd refill loop no longer spawns a session.
- Any item that existed only in those 160 commits must be re-landed on `closeout/v1-final` via cherry-pick from the bundle.
