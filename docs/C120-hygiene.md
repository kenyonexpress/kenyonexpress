# C120 — Repo hygiene

- `.gitignore`: added `logs/`, `STATE.md.bak`, `*.raw`, and `claude_STATE.md` (the loop still appends to it; it must not be tracked again).
- `git rm --cached` on all 192 tracked files under `logs/` (cron, maint3, maint9 and top-level logs). Files stay on disk.
- `claude_STATE.md` removed from git. It was not a byte-identical duplicate: a stale v5.3.0 snapshot with a literal `$(date)`, 81 lines, no entries since early in the run. `STATE.md` (item log) and `claude/STATE.md` ("המשך מ") are the live state files.
- Follow-up outside the repo: `~/ke-goals/loop.sh` still tells the agent to append to `claude_STATE.md`. The ignore rule keeps that from becoming drift again.
- Forbidden files: none touched.
