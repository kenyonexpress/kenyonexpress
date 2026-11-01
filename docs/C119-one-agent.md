# C119 — ONE-AGENT RULE

- tmux: killed `ke-autopilot`; `tmux ls` shows only `ke-final`.
- LaunchAgents: `com.kenyonexpress.{auto-merger,guardian,main-auto-pull,watchdog}.plist` booted out and renamed `*.disabled.c119`. No active autopilot/watchdog/guardian/auto-merger/main-auto-pull plists remain.
- Stray `next dev` from `ke-autopilot-v2` killed.
- Merge: `autopilot` -> `closeout/v1-final` (`--no-ff -X theirs`), done in the worktree that holds v1-final (kenyonexpress-web/kenyonexpress). `src/app/layout.tsx` kept at pre-merge state (forbidden file).
- Not pushed.
